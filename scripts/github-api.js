/**
 * GitHub API Client for LeetCommit
 * Pure client-side GitHub REST API integration using Personal Access Tokens (PAT).
 * No third-party OAuth, backend servers, or external API keys needed.
 */

export const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Mapping of LeetCode language slugs to standard file extensions
 */
export const LANGUAGE_EXTENSIONS = {
  'cpp': 'cpp',
  'c++': 'cpp',
  'c': 'c',
  'csharp': 'cs',
  'c#': 'cs',
  'java': 'java',
  'python': 'py',
  'python3': 'py',
  'py': 'py',
  'javascript': 'js',
  'js': 'js',
  'typescript': 'ts',
  'ts': 'ts',
  'php': 'php',
  'swift': 'swift',
  'kotlin': 'kt',
  'dart': 'dart',
  'golang': 'go',
  'go': 'go',
  'ruby': 'rb',
  'scala': 'scala',
  'rust': 'rs',
  'rs': 'rs',
  'racket': 'rkt',
  'erlang': 'erl',
  'elixir': 'ex',
  'mysql': 'sql',
  'mssql': 'sql',
  'oraclesql': 'sql',
  'postgresql': 'sql',
  'sql': 'sql',
  'pythondata': 'py', // Pandas
  'pandas': 'py',
  'bash': 'sh',
  'shell': 'sh'
};

/**
 * Safely converts any UTF-8 string to Base64 with full Unicode support
 */
export function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

/**
 * Safely decodes Base64 string back to UTF-8
 */
export function base64ToUtf8(base64) {
  const clean = (base64 || '').replace(/\s/g, '');
  return decodeURIComponent(escape(atob(clean)));
}

/**
 * Helper to build standard GitHub API headers
 */
function getHeaders(token) {
  return {
    'Authorization': `Bearer ${token.trim()}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };
}

/**
 * Validate GitHub Personal Access Token (PAT)
 * Returns authenticated user info.
 */
export async function validateToken(token) {
  if (!token || !token.trim()) {
    throw new Error('Personal Access Token is required.');
  }

  const response = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: getHeaders(token)
  });

  if (response.status === 401) {
    throw new Error('Invalid or expired Personal Access Token. Please verify permissions.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `GitHub error: HTTP ${response.status}`);
  }

  const user = await response.json();
  return {
    login: user.login,
    name: user.name || user.login,
    avatarUrl: user.avatar_url,
    profileUrl: user.html_url
  };
}

/**
 * Fetch repositories accessible by the token
 */
export async function getUserRepositories(token) {
  const response = await fetch(`${GITHUB_API_BASE}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator`, {
    headers: getHeaders(token)
  });

  if (!response.ok) {
    return [];
  }

  const repos = await response.json();
  return repos.map(r => ({
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    defaultBranch: r.default_branch || 'main',
    htmlUrl: r.html_url,
    description: r.description || ''
  }));
}

/**
 * Check if a specific repository exists and user has push (write) permissions
 */
export async function checkRepository(token, owner, repo) {
  const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
    headers: getHeaders(token)
  });

  if (response.status === 404) {
    throw new Error(`Repository "${owner}/${repo}" was not found. Check if it exists or create it.`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(`Access denied to repository "${owner}/${repo}". Make sure your PAT is authorized for this repo with "Contents: Read & write" permission.`);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `GitHub error: HTTP ${response.status}`);
  }

  const data = await response.json();
  const hasPush = data.permissions ? data.permissions.push : true;

  return {
    fullName: data.full_name,
    defaultBranch: data.default_branch || 'main',
    private: data.private,
    htmlUrl: data.html_url,
    hasPushPermission: hasPush
  };
}

/**
 * Create a new repository on GitHub for the user
 */
export async function createRepository(token, repoName, isPrivate = false, description = 'My LeetCode Solutions - Automated by LeetCommit') {
  const response = await fetch(`${GITHUB_API_BASE}/user/repos`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({
      name: repoName.trim(),
      private: isPrivate,
      description: description,
      auto_init: true // Creates an initial commit with README.md so the default branch exists
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to create repository: HTTP ${response.status}`);
  }

  const data = await response.json();
  return {
    fullName: data.full_name,
    defaultBranch: data.default_branch || 'main',
    htmlUrl: data.html_url
  };
}

/**
 * Check if a file exists on GitHub and retrieve its SHA and existing content
 */
export async function getFileDetails(token, owner, repo, path, branch = 'main') {
  const encodedPath = encodeURIComponent(path).replace(/%2F/g, '/');
  const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${encodedPath}?ref=${branch}`, {
    headers: getHeaders(token)
  });

  if (response.status === 404) {
    return { exists: false, sha: null, content: null };
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Failed to inspect file: HTTP ${response.status}`);
  }

  const data = await response.json();
  let decodedContent = null;
  if (data.content) {
    try {
      decodedContent = base64ToUtf8(data.content);
    } catch {
      decodedContent = null;
    }
  }

  return {
    exists: true,
    sha: data.sha,
    content: decodedContent
  };
}

/**
 * Commit or update a file on GitHub repository
 */
export async function putFile(token, owner, repo, path, contentStr, commitMessage, branch = 'main') {
  if (!contentStr || typeof contentStr !== 'string' || contentStr.trim().length === 0) {
    throw new Error(`Refusing to commit empty content to "${path}". Aborting to prevent blank files.`);
  }

  const encodedPath = encodeURIComponent(path).replace(/%2F/g, '/');
  
  // Check if file already exists
  const existing = await getFileDetails(token, owner, repo, path, branch);

  // If content is already identical, no need to make a duplicate commit
  if (existing.exists && existing.content !== null && existing.content.trim() === contentStr.trim()) {
    return {
      success: true,
      skipped: true,
      sha: existing.sha,
      path: path,
      message: 'File content is identical. Already up-to-date.'
    };
  }

  const bodyPayload = {
    message: commitMessage,
    content: utf8ToBase64(contentStr),
    branch: branch
  };

  if (existing.exists && existing.sha) {
    bodyPayload.sha = existing.sha;
  }

  const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${encodedPath}`, {
    method: 'PUT',
    headers: getHeaders(token),
    body: JSON.stringify(bodyPayload)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to commit file to GitHub: HTTP ${response.status}`);
  }

  const result = await response.json();
  return {
    success: true,
    skipped: false,
    commitSha: result.commit?.sha,
    htmlUrl: result.content?.html_url,
    path: path
  };
}

/**
 * Commit both solution code and README.md for a solved LeetCode problem
 */
export async function commitProblemSolution({
  token,
  owner,
  repo,
  branch = 'main',
  folderFormat = 'flat', // 'flat' (0001-two-sum) or 'difficulty' (Easy/0001-two-sum)
  problemData
}) {
  const {
    questionId,
    titleSlug,
    title,
    difficulty,
    code,
    lang,
    runtime,
    runtimePercentile,
    memory,
    memoryPercentile,
    markdownDescription,
    topicTags,
    url
  } = problemData;

  // Strict safeguard: NEVER commit blank solution code
  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    throw new Error(`Solution code for "${title || titleSlug}" is empty. Commit aborted to prevent blank code.`);
  }

  // Format problem number: e.g. 1 -> 0001, 142 -> 0142
  const numericId = parseInt(questionId, 10);
  const formattedId = (!isNaN(numericId) && numericId > 0)
    ? String(numericId).padStart(4, '0')
    : (questionId && String(questionId) !== '0' ? String(questionId) : '');
  
  // Folder name: e.g. "0001-two-sum" or "two-sum" if no number available
  const folderSlug = formattedId ? `${formattedId}-${titleSlug}` : titleSlug;
  
  // Root directory path based on user folder preference
  let folderPath = folderSlug;
  if (folderFormat === 'difficulty' && difficulty) {
    folderPath = `${difficulty}/${folderSlug}`;
  }

  // Determine file extension
  const cleanLang = (lang || '').toLowerCase().trim();
  const fileExtension = LANGUAGE_EXTENSIONS[cleanLang] || 'txt';

  // File paths
  const codeFilePath = `${folderPath}/${titleSlug}.${fileExtension}`;
  const readmeFilePath = `${folderPath}/README.md`;

  // Generate README Content
  const readmeContent = generateReadmeMarkdown({
    questionId: numericId || questionId,
    title: title || titleSlug,
    difficulty: difficulty || 'Unknown',
    url: url || `https://leetcode.com/problems/${titleSlug}/`,
    lang: cleanLang,
    runtime: runtime,
    runtimePercentile: runtimePercentile,
    memory: memory,
    memoryPercentile: memoryPercentile,
    topicTags: topicTags || [],
    description: markdownDescription || 'No description provided.'
  });

  // 1. Commit the Solution Code file
  const codeCommitMsg = `Solve: ${title || titleSlug} [${difficulty || 'Solved'}] (${cleanLang})`;
  const codeResult = await putFile(token, owner, repo, codeFilePath, code, codeCommitMsg, branch);

  // If the code file is already identical on GitHub, do NOT make duplicate commits!
  if (codeResult.skipped) {
    return {
      success: true,
      alreadySynced: true,
      folderPath,
      codeFile: codeResult,
      htmlUrl: codeResult.htmlUrl || `https://github.com/${owner}/${repo}/tree/${branch}/${folderPath}`,
      message: 'Code is identical to existing solution on GitHub. Skipped duplicate push.'
    };
  }

  // 2. Commit the README.md file
  const readmeCommitMsg = `Add README: ${title || titleSlug} [${difficulty || 'Solved'}]`;
  const readmeResult = await putFile(token, owner, repo, readmeFilePath, readmeContent, readmeCommitMsg, branch);

  return {
    success: true,
    alreadySynced: false,
    folderPath,
    codeFile: codeResult,
    readmeFile: readmeResult,
    htmlUrl: codeResult.htmlUrl || `https://github.com/${owner}/${repo}/tree/${branch}/${folderPath}`
  };
}

/**
 * Generate formatted Markdown for README.md
 */
export function generateReadmeMarkdown({
  questionId,
  title,
  difficulty,
  url,
  lang,
  runtime,
  runtimePercentile,
  memory,
  memoryPercentile,
  topicTags,
  description
}) {
  // Difficulty badge colors
  const diffBadgeColor = {
    'Easy': 'brightgreen',
    'Medium': 'orange',
    'Hard': 'red'
  }[difficulty] || 'lightgrey';

  const dateSolved = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  let badges = `![Difficulty: ${difficulty}](https://img.shields.io/badge/Difficulty-${difficulty}-${diffBadgeColor}?style=flat-square)\n`;
  badges += `![Language: ${lang}](https://img.shields.io/badge/Language-${encodeURIComponent(lang)}-blue?style=flat-square)\n`;
  if (runtime) {
    const runtimeText = runtimePercentile ? `${runtime} (Beats ${runtimePercentile}%)` : runtime;
    badges += `![Runtime](https://img.shields.io/badge/Runtime-${encodeURIComponent(runtimeText)}-success?style=flat-square)\n`;
  }
  if (memory) {
    const memoryText = memoryPercentile ? `${memory} (Beats ${memoryPercentile}%)` : memory;
    badges += `![Memory](https://img.shields.io/badge/Memory-${encodeURIComponent(memoryText)}-informational?style=flat-square)\n`;
  }

  let tagsMarkdown = '';
  if (topicTags && topicTags.length > 0) {
    tagsMarkdown = `### Topics\n` + topicTags.map(t => `\`${t}\``).join(' ') + '\n\n---\n\n';
  }

  return `# [${questionId}. ${title}](${url})

${badges}

${tagsMarkdown}### Description

${description.trim()}

---

*Solved on ${dateSolved} using **LeetCommit**.*
`;
}

