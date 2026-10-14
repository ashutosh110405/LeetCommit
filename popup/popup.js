/**
 * LeetCommit Popup Controller
 * Manages GitHub PAT authentication, repository setup, and sync dashboard.
 */

const GITHUB_API_BASE = 'https://api.github.com';

// Unified Storage helper (supports chrome.storage.local with localStorage fallback)
const storage = {
  async get(keys) {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      try {
        return await chrome.storage.local.get(keys);
      } catch (e) {
        console.warn('chrome.storage.local read error, using fallback:', e);
      }
    }
    const result = {};
    const keyList = Array.isArray(keys) ? keys : [keys];
    keyList.forEach(k => {
      const val = localStorage.getItem(k);
      if (val !== null) {
        try {
          result[k] = JSON.parse(val);
        } catch {
          result[k] = val;
        }
      }
    });
    return result;
  },
  async set(obj) {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      try {
        await chrome.storage.local.set(obj);
      } catch (e) {
        console.warn('chrome.storage.local write error, using fallback:', e);
      }
    }
    Object.entries(obj).forEach(([k, v]) => {
      localStorage.setItem(k, typeof v === 'object' ? JSON.stringify(v) : v);
    });
  },
  async remove(keys) {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      try {
        await chrome.storage.local.remove(keys);
      } catch (e) {
        console.warn('chrome.storage.local remove error:', e);
      }
    }
    const keyList = Array.isArray(keys) ? keys : [keys];
    keyList.forEach(k => localStorage.removeItem(k));
  }
};

function getHeaders(token) {
  return {
    'Authorization': `Bearer ${token.trim()}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };
}

async function validateToken(token) {
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

async function getUserRepositories(token) {
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

async function checkRepository(token, owner, repo) {
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

async function createRepository(token, repoName, isPrivate = false, description = 'My LeetCode Solutions - Automated by LeetCommit') {
  const response = await fetch(`${GITHUB_API_BASE}/user/repos`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({
      name: repoName.trim(),
      private: isPrivate,
      description: description,
      auto_init: true
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

// DOM Elements
const setupView = document.getElementById('setup-view');
const dashboardView = document.getElementById('dashboard-view');

const statusPill = document.getElementById('status-pill');
const statusText = document.getElementById('status-text');
const alertBanner = document.getElementById('alert-banner');
const alertMessage = document.getElementById('alert-message');

const configForm = document.getElementById('config-form');
const patInput = document.getElementById('pat-input');
const togglePatBtn = document.getElementById('toggle-pat-visibility');
const btnVerifyToken = document.getElementById('btn-verify-token');

const repoInput = document.getElementById('repo-input');
const repoSelectContainer = document.getElementById('repo-select-container');
const repoSelect = document.getElementById('repo-select');

const btnToggleCreateRepo = document.getElementById('btn-toggle-create-repo');
const createRepoPanel = document.getElementById('create-repo-panel');
const newRepoName = document.getElementById('new-repo-name');
const newRepoPrivate = document.getElementById('new-repo-private');
const btnCreateRepoSubmit = document.getElementById('btn-create-repo-submit');

const branchInput = document.getElementById('branch-input');
const folderFormatSelect = document.getElementById('folder-format-select');
const btnSaveConnect = document.getElementById('btn-save-connect');

const toggleGuideBtn = document.getElementById('toggle-guide-btn');
const tokenGuide = document.getElementById('token-guide');
const guideArrow = document.getElementById('guide-arrow');

// Dashboard elements
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const repoLink = document.getElementById('repo-link');
const dashboardRepoName = document.getElementById('dashboard-repo-name');
const dashboardBranch = document.getElementById('dashboard-branch');
const statSyncCount = document.getElementById('stat-sync-count');
const recentList = document.getElementById('recent-list');
const btnRefreshHistory = document.getElementById('btn-refresh-history');
const btnEditConfig = document.getElementById('btn-edit-config');
const btnDisconnect = document.getElementById('btn-disconnect');
const btnCancelEdit = document.getElementById('btn-cancel-edit');

let cachedUser = null;

// Initialize Popup
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadStoredState();
});

function setupEventListeners() {
  // Toggle Token Guide
  if (toggleGuideBtn) {
    toggleGuideBtn.addEventListener('click', () => {
      const isHidden = tokenGuide.classList.contains('hidden');
      tokenGuide.classList.toggle('hidden');
      guideArrow.textContent = isHidden ? '▲' : '▼';
    });
  }

  // Toggle Password Visibility
  if (togglePatBtn) {
    togglePatBtn.addEventListener('click', () => {
      const isPassword = patInput.type === 'password';
      patInput.type = isPassword ? 'text' : 'password';
      togglePatBtn.textContent = isPassword ? '🔒' : '👁️';
    });
  }

  // Verify Token Button
  if (btnVerifyToken) btnVerifyToken.addEventListener('click', handleVerifyToken);

  // Toggle Create Repo Panel
  if (btnToggleCreateRepo) {
    btnToggleCreateRepo.addEventListener('click', () => {
      createRepoPanel.classList.toggle('hidden');
    });
  }

  // Create Repo Submit
  if (btnCreateRepoSubmit) btnCreateRepoSubmit.addEventListener('click', handleCreateRepo);

  // Repo Select Changed
  if (repoSelect) {
    repoSelect.addEventListener('change', () => {
      if (repoSelect.value) {
        repoInput.value = repoSelect.value;
        const selectedOption = repoSelect.options[repoSelect.selectedIndex];
        if (selectedOption.dataset.branch) {
          branchInput.value = selectedOption.dataset.branch;
        }
      }
    });
  }

  // Form Submit (Save & Connect)
  if (configForm) configForm.addEventListener('submit', handleSaveConfig);

  // Dashboard Actions
  if (btnEditConfig) {
    btnEditConfig.addEventListener('click', async () => {
      const data = await storage.get(null);
      await showSetupView(data);
    });
  }
  if (btnCancelEdit) {
    btnCancelEdit.addEventListener('click', async () => {
      const data = await storage.get(null);
      if (data && data.github_pat && data.github_repo) {
        showDashboardView(data);
      }
    });
  }
  if (btnDisconnect) btnDisconnect.addEventListener('click', handleDisconnect);
  if (btnRefreshHistory) btnRefreshHistory.addEventListener('click', refreshDashboardData);
}

/**
 * Load stored state from storage
 */
async function loadStoredState() {
  const data = await storage.get([
    'github_pat',
    'github_repo',
    'github_branch',
    'github_user',
    'folder_format',
    'recent_syncs',
    'sync_count'
  ]);

  if (data.github_pat && data.github_repo) {
    cachedUser = data.github_user || null;
    showDashboardView(data);
  } else {
    if (data.github_pat) patInput.value = data.github_pat;
    if (data.github_repo) repoInput.value = data.github_repo;
    showSetupView(data);
  }
}

function showAlert(message, type = 'info', duration = 5000) {
  if (!alertBanner || !alertMessage) return;
  alertBanner.className = `alert-banner ${type}`;
  alertMessage.textContent = message;
  alertBanner.classList.remove('hidden');

  if (duration > 0) {
    setTimeout(() => {
      alertBanner.classList.add('hidden');
    }, duration);
  }
}

function hideAlert() {
  if (alertBanner) alertBanner.classList.add('hidden');
}

/**
 * Verify token & fetch repos
 */
async function handleVerifyToken() {
  const token = patInput.value.trim();
  if (!token) {
    showAlert('Please enter your Personal Access Token (PAT) first.', 'error');
    patInput.focus();
    return;
  }

  btnVerifyToken.disabled = true;
  btnVerifyToken.textContent = 'Verifying...';
  hideAlert();

  try {
    const user = await validateToken(token);
    cachedUser = user;
    showAlert(`✓ Authenticated as @${user.login}! Fetching repositories...`, 'success', 3000);

    const repos = await getUserRepositories(token);
    if (repos && repos.length > 0) {
      repoSelect.innerHTML = '<option value="">-- Choose from your repositories --</option>';
      repos.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.fullName;
        opt.textContent = `${r.fullName} ${r.private ? '(Private)' : '(Public)'}`;
        opt.dataset.branch = r.defaultBranch;
        repoSelect.appendChild(opt);
      });
      repoSelectContainer.classList.remove('hidden');

      // Auto select leetcode-solutions if available
      const leetRepo = repos.find(r => r.name.toLowerCase() === 'leetcode-solutions');
      if (leetRepo) {
        repoSelect.value = leetRepo.fullName;
        repoInput.value = leetRepo.fullName;
        branchInput.value = leetRepo.defaultBranch || 'main';
      }

      showAlert(`✓ Verified! Loaded ${repos.length} accessible repositories.`, 'success', 4000);
    } else {
      showAlert(`✓ Verified as @${user.login}. Enter your target repository name below.`, 'success', 4000);
    }
  } catch (err) {
    showAlert(`Verification failed: ${err.message}`, 'error', 7000);
  } finally {
    btnVerifyToken.disabled = false;
    btnVerifyToken.textContent = 'Verify Token & Fetch Repos';
  }
}

/**
 * Create a new repository on GitHub
 */
async function handleCreateRepo() {
  const token = patInput.value.trim();
  const repoName = newRepoName.value.trim();
  const isPrivate = newRepoPrivate.checked;

  if (!token) {
    showAlert('Please enter and verify your token first.', 'error');
    return;
  }

  if (!repoName) {
    showAlert('Please enter a repository name.', 'error');
    newRepoName.focus();
    return;
  }

  btnCreateRepoSubmit.disabled = true;
  btnCreateRepoSubmit.textContent = 'Creating on GitHub...';

  try {
    const result = await createRepository(token, repoName, isPrivate);
    repoInput.value = result.fullName;
    branchInput.value = result.defaultBranch || 'main';
    createRepoPanel.classList.add('hidden');
    showAlert(`✓ Repository "${result.fullName}" created successfully!`, 'success', 5000);
  } catch (err) {
    showAlert(`Failed to create repository: ${err.message}`, 'error', 7000);
  } finally {
    btnCreateRepoSubmit.disabled = false;
    btnCreateRepoSubmit.textContent = 'Create on GitHub';
  }
}

/**
 * Save configuration and connect
 */
async function handleSaveConfig(e) {
  if (e) e.preventDefault();

  const token = patInput.value.trim();
  let repo = repoInput.value.trim();
  const branch = branchInput.value.trim() || 'main';
  const folderFormat = folderFormatSelect.value;

  if (!token) {
    showAlert('Personal Access Token is required.', 'error');
    return;
  }

  if (!repo) {
    showAlert('Target Repository is required.', 'error');
    return;
  }

  btnSaveConnect.disabled = true;
  btnSaveConnect.innerHTML = '<span class="lc-spinner"></span> Connecting...';
  hideAlert();

  try {
    if (!cachedUser) {
      cachedUser = await validateToken(token);
    }

    if (!repo.includes('/')) {
      repo = `${cachedUser.login}/${repo}`;
      repoInput.value = repo;
    }

    const [owner, repoName] = repo.split('/');
    if (!owner || !repoName) {
      throw new Error('Repository format must be "username/repository-name".');
    }

    const repoData = await checkRepository(token, owner, repoName);
    if (!repoData.hasPushPermission) {
      throw new Error(`Token does not have push permission to ${repo}. Ensure "Contents: Read & write" permission is granted.`);
    }

    await storage.set({
      github_pat: token,
      github_repo: repo,
      github_branch: branch,
      folder_format: folderFormat,
      github_user: cachedUser
    });

    showAlert('✓ Connected to GitHub successfully!', 'success', 2500);

    setTimeout(async () => {
      const data = await storage.get(null);
      showDashboardView(data);
    }, 600);
  } catch (err) {
    showAlert(`Connection failed: ${err.message}`, 'error', 8000);
  } finally {
    btnSaveConnect.disabled = false;
    btnSaveConnect.innerHTML = '<span class="btn-text-content">Save & Connect</span>';
  }
}

/**
 * Automatically fetch accessible repositories and populate dropdown for selecting/changing repo
 */
async function populateRepoDropdown(token, currentRepo = '') {
  if (!token || !repoSelect || !repoSelectContainer) return;
  try {
    const repos = await getUserRepositories(token);
    if (repos && repos.length > 0) {
      repoSelect.innerHTML = '<option value="">-- Choose from your repositories --</option>';
      repos.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.fullName;
        opt.textContent = `${r.fullName} ${r.private ? '(Private)' : '(Public)'}`;
        opt.dataset.branch = r.defaultBranch;
        if (currentRepo && r.fullName.toLowerCase() === currentRepo.toLowerCase()) {
          opt.selected = true;
        }
        repoSelect.appendChild(opt);
      });
      repoSelectContainer.classList.remove('hidden');

      if (currentRepo) {
        repoSelect.value = currentRepo;
      }
    }
  } catch (err) {
    console.warn('[LeetCommit] Could not pre-fetch repos for dropdown:', err);
  }
}

/**
 * Switch to Setup View
 */
async function showSetupView(data = null) {
  if (setupView) setupView.classList.remove('hidden');
  if (dashboardView) dashboardView.classList.add('hidden');

  if (!data || !data.github_pat) {
    data = await storage.get([
      'github_pat',
      'github_repo',
      'github_branch',
      'github_user',
      'folder_format'
    ]);
  }

  const isConnected = Boolean(data?.github_pat && data?.github_repo);

  // Keep status as Active if user is already connected
  if (statusPill && statusText) {
    if (isConnected) {
      statusPill.className = 'status-pill connected';
      statusText.textContent = 'Active';
    } else {
      statusPill.className = 'status-pill disconnected';
      statusText.textContent = 'Disconnected';
    }
  }

  // Display the under-use PAT key in the input field
  if (data?.github_pat && patInput) {
    patInput.value = data.github_pat;
  }
  if (data?.github_repo && repoInput) {
    repoInput.value = data.github_repo;
  }
  if (data?.github_branch && branchInput) {
    branchInput.value = data.github_branch;
  }
  if (data?.folder_format && folderFormatSelect) {
    folderFormatSelect.value = data.folder_format;
  }

  // Automatically fetch accessible repos so user can select/change repo from dropdown
  if (data?.github_pat) {
    populateRepoDropdown(data.github_pat, data.github_repo || '');
  }

  // Toggle Cancel button if user is already connected
  if (btnCancelEdit) {
    if (isConnected) {
      btnCancelEdit.classList.remove('hidden');
    } else {
      btnCancelEdit.classList.add('hidden');
    }
  }

  // Update submit button label
  if (btnSaveConnect) {
    const textSpan = btnSaveConnect.querySelector('.btn-text-content');
    if (textSpan) {
      textSpan.textContent = isConnected ? 'Update & Save Changes' : 'Save & Connect';
    }
  }
}

/**
 * Switch to Dashboard View
 */
function showDashboardView(data) {
  if (setupView) setupView.classList.add('hidden');
  if (dashboardView) dashboardView.classList.remove('hidden');

  if (statusPill) statusPill.className = 'status-pill connected';
  if (statusText) statusText.textContent = 'Active';

  const user = data.github_user || { login: 'ashutosh110405', avatarUrl: '../assets/icon48.png' };
  if (userAvatar) userAvatar.src = user.avatarUrl || `https://github.com/${(data.github_repo || '').split('/')[0]}.png`;
  if (userName) userName.textContent = `@${user.login || (data.github_repo || '').split('/')[0]}`;

  if (dashboardRepoName) dashboardRepoName.textContent = data.github_repo || 'ashutosh110405/leetcode-solutions';
  if (repoLink) repoLink.href = `https://github.com/${data.github_repo || 'ashutosh110405/leetcode-solutions'}`;

  if (dashboardBranch) dashboardBranch.textContent = data.github_branch || 'main';
  if (statSyncCount) statSyncCount.textContent = data.sync_count || 0;

  renderRecentSubmissions(data.recent_syncs || []);
}

function renderRecentSubmissions(syncs) {
  if (!recentList) return;
  if (!syncs || syncs.length === 0) {
    recentList.innerHTML = `
      <div class="empty-state">
        No synced problems yet.<br>
        Solve any problem on LeetCode to auto-commit!
      </div>
    `;
    return;
  }

  recentList.innerHTML = '';
  syncs.forEach(item => {
    const itemEl = document.createElement('a');
    itemEl.className = 'recent-item';
    itemEl.href = item.htmlUrl || `https://leetcode.com/problems/${item.titleSlug}/`;
    itemEl.target = '_blank';
    itemEl.rel = 'noopener';

    const diffClass = item.difficulty || 'Medium';
    const runtimeStr = item.runtime ? `${item.runtime}` : '';
    const langStr = item.lang || '';

    itemEl.innerHTML = `
      <div class="recent-left">
        <div class="recent-title-line">
          <span class="diff-tag ${diffClass}">${diffClass}</span>
          <span class="recent-title">${item.id ? `${item.id}. ` : ''}${item.title || item.titleSlug}</span>
        </div>
        <div class="recent-meta">
          <span>${langStr}</span>
          ${runtimeStr ? `<span>• ${runtimeStr}</span>` : ''}
          <span>• ${formatTimeAgo(item.timestamp)}</span>
        </div>
      </div>
      <div class="recent-right">&nearr;</div>
    `;

    recentList.appendChild(itemEl);
  });
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return 'recently';
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function refreshDashboardData() {
  const data = await storage.get(null);
  if (statSyncCount) statSyncCount.textContent = data.sync_count || 0;
  renderRecentSubmissions(data.recent_syncs || []);
}

async function handleDisconnect() {
  if (confirm('Disconnect GitHub and remove your stored token?')) {
    await storage.remove(['github_pat', 'github_repo', 'github_user']);
    cachedUser = null;
    if (patInput) patInput.value = '';
    if (repoInput) repoInput.value = '';
    showSetupView();
    showAlert('Disconnected from GitHub.', 'info');
  }
}
