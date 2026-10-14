/**
 * LeetCommit Background Service Worker (Manifest V3)
 * Orchestrates GitHub commits, manages storage, and updates extension badges.
 */

import { commitProblemSolution, validateToken, checkRepository } from './github-api.js';

// Setup badge defaults on installation
chrome.runtime.onInstalled.addListener(async (details) => {
  chrome.action.setBadgeBackgroundColor({ color: '#10B981' });
  console.log('[LeetCommit] Extension installed successfully.');
  
  const config = await chrome.storage.local.get(['github_pat', 'github_repo']);
  if (!config.github_pat || !config.github_repo) {
    chrome.tabs.create({ url: 'welcome/welcome.html' });
  }
});

// Listen for LeetCode submission URL changes in browser history
if (chrome.webNavigation && chrome.webNavigation.onHistoryStateUpdated) {
  chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
    if (!details.url) return;
    const match = details.url.match(/\/problems\/([^/?#]+)\/submissions\/(\d+)/);
    if (match) {
      const titleSlug = match[1];
      const submissionId = match[2];
      console.log(`[LeetCommit] Detected submission URL in history: slug=${titleSlug}, id=${submissionId}`);
      try {
        chrome.tabs.sendMessage(details.tabId, {
          action: 'SUBMISSION_ID_NAVIGATED',
          titleSlug,
          submissionId
        });
      } catch {}
    }
  }, {
    url: [{ hostSuffix: 'leetcode.com', pathContains: 'submissions' }]
  });
}

// Message router
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'SYNC_SOLUTION') {
    handleSyncSolution(request.problemData)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (request.action === 'VALIDATE_SETTINGS') {
    handleValidateSettings(request.token, request.repo)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

/**
 * Handle committing problem to GitHub
 */
async function handleSyncSolution(problemData) {
  const config = await chrome.storage.local.get([
    'github_pat',
    'github_repo',
    'github_branch',
    'folder_format',
    'recent_syncs',
    'sync_count'
  ]);

  const token = config.github_pat;
  const targetRepo = config.github_repo;
  const branch = config.github_branch || 'main';
  const folderFormat = config.folder_format || 'flat';

  if (!token || !targetRepo) {
    throw new Error('Please configure your GitHub PAT and Target Repository in the LeetCommit extension popup first.');
  }

  // Parse owner and repo name (e.g. "octocat/leetcode-solutions")
  const repoParts = targetRepo.trim().split('/');
  if (repoParts.length !== 2) {
    throw new Error(`Invalid repository format "${targetRepo}". Expected format: username/repository-name`);
  }

  const [owner, repo] = repoParts;
  const cleanCode = (problemData.code || '').trim();

  // Strict check: NEVER commit blank solution code
  if (!cleanCode || cleanCode.length === 0) {
    throw new Error('Solution code is empty or missing. Commit aborted to prevent pushing blank code.');
  }

  const cacheKey = `${problemData.titleSlug}_${problemData.lang || 'python3'}`;
  const syncedCodes = config.synced_codes || {};

  // Check 1: If identical code was already successfully pushed previously, do not push again!
  if (syncedCodes[cacheKey] && syncedCodes[cacheKey] === cleanCode) {
    console.log(`[LeetCommit] Code for ${cacheKey} is identical to last push. Skipping duplicate commit.`);
    return {
      success: true,
      alreadySynced: true,
      folderPath: `${problemData.questionId}-${problemData.titleSlug}`,
      htmlUrl: `https://github.com/${owner}/${repo}`,
      repo: `${owner}/${repo}`
    };
  }

  // Execute commit via pure client-side GitHub REST API
  const commitResult = await commitProblemSolution({
    token,
    owner,
    repo,
    branch,
    folderFormat,
    problemData
  });

  // If GitHub confirms the file content was already identical on the remote repo
  if (commitResult.alreadySynced) {
    syncedCodes[cacheKey] = cleanCode;
    await chrome.storage.local.set({ synced_codes: syncedCodes });
    return {
      success: true,
      alreadySynced: true,
      htmlUrl: commitResult.htmlUrl,
      folderPath: commitResult.folderPath,
      repo: `${owner}/${repo}`
    };
  }

  // Update sync statistics & history for new commits
  const recentSyncs = config.recent_syncs || [];
  const syncCount = (config.sync_count || 0) + 1;
  syncedCodes[cacheKey] = cleanCode;

  const syncRecord = {
    id: problemData.questionId,
    titleSlug: problemData.titleSlug,
    title: problemData.title,
    difficulty: problemData.difficulty,
    lang: problemData.lang,
    runtime: problemData.runtime,
    memory: problemData.memory,
    timestamp: Date.now(),
    htmlUrl: commitResult.htmlUrl,
    folderPath: commitResult.folderPath
  };

  // Prepend and keep latest 30 submissions
  const updatedHistory = [syncRecord, ...recentSyncs.filter(s => s.titleSlug !== problemData.titleSlug)].slice(0, 30);

  await chrome.storage.local.set({
    recent_syncs: updatedHistory,
    sync_count: syncCount,
    last_synced: syncRecord,
    synced_codes: syncedCodes
  });

  // Flash checkmark on extension badge
  try {
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#10B981' });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 4000);
  } catch {}

  return {
    success: true,
    alreadySynced: false,
    htmlUrl: commitResult.htmlUrl,
    folderPath: commitResult.folderPath,
    repo: `${owner}/${repo}`
  };
}

/**
 * Quick validation helper
 */
async function handleValidateSettings(token, fullRepo) {
  const user = await validateToken(token);
  const [owner, repo] = fullRepo.split('/');
  const repoData = await checkRepository(token, owner, repo);
  return {
    success: true,
    user,
    repo: repoData
  };
}

