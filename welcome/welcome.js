/**
 * LeetCommit Onboarding Wizard Controller
 * Self-contained: works both inside extension (chrome-extension://)
 * and when opened directly as a file (file:///).
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
  }
};

// GitHub API Client
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

// Elements
const step1 = document.getElementById('step-1');
const step2 = document.getElementById('step-2');
const step3 = document.getElementById('step-3');
const stepSuccess = document.getElementById('step-success');

const stepNode1 = document.getElementById('step-node-1');
const stepNode2 = document.getElementById('step-node-2');
const stepNode3 = document.getElementById('step-node-3');
const stepLine1 = document.getElementById('step-line-1');
const stepLine2 = document.getElementById('step-line-2');

const alertBanner = document.getElementById('alert-banner');
const alertMessage = document.getElementById('alert-message');

// Step 1 Elements
const patInput = document.getElementById('pat-input');
const togglePatBtn = document.getElementById('toggle-pat-btn');
const btnLoginStep1 = document.getElementById('btn-login-step1');

// Step 2 Elements
const userAvatar = document.getElementById('user-avatar');
const userLogin = document.getElementById('user-login');
const tabExistingBtn = document.getElementById('tab-existing-btn');
const tabCreateBtn = document.getElementById('tab-create-btn');
const tabExistingContent = document.getElementById('tab-existing-content');
const tabCreateContent = document.getElementById('tab-create-content');
const repoDropdown = document.getElementById('repo-dropdown');
const manualRepoInput = document.getElementById('manual-repo-input');
const newRepoName = document.getElementById('new-repo-name');
const newRepoPrivate = document.getElementById('new-repo-private');
const btnCreateRepoAction = document.getElementById('btn-create-repo-action');
const branchInput = document.getElementById('branch-input');
const folderFormat = document.getElementById('folder-format');
const btnBackStep1 = document.getElementById('btn-back-step1');
const btnNextStep2 = document.getElementById('btn-next-step2');

// Step 3 Elements
const summaryUser = document.getElementById('summary-user');
const summaryRepo = document.getElementById('summary-repo');
const summaryBranch = document.getElementById('summary-branch');
const summaryFolder = document.getElementById('summary-folder');
const btnBackStep2 = document.getElementById('btn-back-step2');
const btnAuthorizeFinish = document.getElementById('btn-authorize-finish');

// Step Success Elements
const successRepoLink = document.getElementById('success-repo-link');
const successGithubBtn = document.getElementById('success-github-btn');

// State
let state = {
  token: '',
  user: null,
  repos: [],
  selectedRepo: '',
  branch: 'main',
  folderFormat: 'flat'
};

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  checkEnvironment();
  await checkExistingConfig();
});

function checkEnvironment() {
  if (window.location.protocol === 'file:') {
    const banner = document.createElement('div');
    banner.style.cssText = 'background: rgba(255, 161, 22, 0.15); border: 1px solid #FFA116; color: #FFA116; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; text-align: center;';
    banner.innerHTML = '⚡ You opened this page directly as a local file. To auto-sync on LeetCode, make sure to also load the extension in <strong>chrome://extensions</strong> via <em>Load unpacked</em>.';
    const container = document.querySelector('.welcome-container');
    if (container) {
      container.insertBefore(banner, container.firstChild);
    }
  }
}

function setupEventListeners() {
  // Toggle password visibility
  if (togglePatBtn) {
    togglePatBtn.addEventListener('click', () => {
      const isPassword = patInput.type === 'password';
      patInput.type = isPassword ? 'text' : 'password';
      togglePatBtn.textContent = isPassword ? '🔒' : '👁️';
    });
  }

  // Step 1: Login
  if (btnLoginStep1) {
    btnLoginStep1.addEventListener('click', handleStep1Login);
  }

  // Step 2: Tabs
  if (tabExistingBtn && tabCreateBtn) {
    tabExistingBtn.addEventListener('click', () => switchRepoTab('existing'));
    tabCreateBtn.addEventListener('click', () => switchRepoTab('create'));
  }

  // Step 2: Create Repo Action
  if (btnCreateRepoAction) {
    btnCreateRepoAction.addEventListener('click', handleCreateRepo);
  }

  // Step 2: Dropdown change
  if (repoDropdown) {
    repoDropdown.addEventListener('change', () => {
      if (repoDropdown.value) {
        manualRepoInput.value = repoDropdown.value;
        const selectedOption = repoDropdown.options[repoDropdown.selectedIndex];
        if (selectedOption.dataset.branch) {
          branchInput.value = selectedOption.dataset.branch;
        }
      }
    });
  }

  // Navigation
  if (btnBackStep1) btnBackStep1.addEventListener('click', () => goToStep(1));
  if (btnNextStep2) btnNextStep2.addEventListener('click', handleStep2Next);
  if (btnBackStep2) btnBackStep2.addEventListener('click', () => goToStep(2));
  if (btnAuthorizeFinish) btnAuthorizeFinish.addEventListener('click', handleStep3Authorize);
}

async function checkExistingConfig() {
  const data = await storage.get(['github_pat', 'github_repo', 'github_branch', 'github_user', 'folder_format']);
  if (data.github_pat && data.github_repo) {
    state.token = data.github_pat;
    state.selectedRepo = data.github_repo;
    state.branch = data.github_branch || 'main';
    state.folderFormat = data.folder_format || 'flat';
    state.user = data.github_user;
    showSuccessView(data.github_repo);
  } else if (data.github_pat && patInput) {
    patInput.value = data.github_pat;
  }
}

function showAlert(msg, type = 'info', duration = 5000) {
  if (!alertBanner || !alertMessage) return;
  alertBanner.className = `alert-banner ${type}`;
  alertMessage.textContent = msg;
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

function switchRepoTab(mode) {
  if (mode === 'existing') {
    tabExistingBtn.classList.add('active');
    tabCreateBtn.classList.remove('active');
    tabExistingContent.classList.remove('hidden');
    tabCreateContent.classList.add('hidden');
  } else {
    tabCreateBtn.classList.add('active');
    tabExistingBtn.classList.remove('active');
    tabCreateContent.classList.remove('hidden');
    tabExistingContent.classList.add('hidden');
  }
}

function goToStep(stepNum) {
  hideAlert();
  [step1, step2, step3, stepSuccess].forEach(s => {
    if (s) s.classList.add('hidden');
  });

  [stepNode1, stepNode2, stepNode3].forEach(node => {
    if (node) node.classList.remove('active', 'completed');
  });
  if (stepLine1) stepLine1.classList.remove('completed');
  if (stepLine2) stepLine2.classList.remove('completed');

  if (stepNum === 1) {
    if (step1) step1.classList.remove('hidden');
    if (stepNode1) stepNode1.classList.add('active');
  } else if (stepNum === 2) {
    if (step2) step2.classList.remove('hidden');
    if (stepNode1) stepNode1.classList.add('completed');
    if (stepLine1) stepLine1.classList.add('completed');
    if (stepNode2) stepNode2.classList.add('active');
  } else if (stepNum === 3) {
    if (step3) step3.classList.remove('hidden');
    if (stepNode1) stepNode1.classList.add('completed');
    if (stepLine1) stepLine1.classList.add('completed');
    if (stepNode2) stepNode2.classList.add('completed');
    if (stepLine2) stepLine2.classList.add('completed');
    if (stepNode3) stepNode3.classList.add('active');
  } else if (stepNum === 4) {
    if (stepSuccess) stepSuccess.classList.remove('hidden');
    if (stepNode1) stepNode1.classList.add('completed');
    if (stepLine1) stepLine1.classList.add('completed');
    if (stepNode2) stepNode2.classList.add('completed');
    if (stepLine2) stepLine2.classList.add('completed');
    if (stepNode3) stepNode3.classList.add('completed');
  }
}

/**
 * Handle Step 1 Login
 */
async function handleStep1Login() {
  const token = patInput.value.trim();
  if (!token) {
    showAlert('Please paste your Personal Access Token (PAT).', 'error');
    patInput.focus();
    return;
  }

  btnLoginStep1.disabled = true;
  btnLoginStep1.innerHTML = 'Verifying with GitHub...';
  hideAlert();

  try {
    const user = await validateToken(token);
    state.token = token;
    state.user = user;

    if (userAvatar) userAvatar.src = user.avatarUrl;
    if (userLogin) userLogin.textContent = `@${user.login}`;

    // Fetch repositories
    showAlert(`✓ Logged in as @${user.login}! Fetching repositories...`, 'success', 2500);
    const repos = await getUserRepositories(token);
    state.repos = repos;

    if (repoDropdown) {
      repoDropdown.innerHTML = '<option value="">-- Choose from your repositories --</option>';
      repos.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.fullName;
        opt.textContent = `${r.fullName} ${r.private ? '(Private)' : '(Public)'}`;
        opt.dataset.branch = r.defaultBranch;
        repoDropdown.appendChild(opt);
      });

      // Default select leetcode-solutions if it exists
      const leetcodeRepo = repos.find(r => r.name.toLowerCase() === 'leetcode-solutions');
      if (leetcodeRepo) {
        repoDropdown.value = leetcodeRepo.fullName;
        manualRepoInput.value = leetcodeRepo.fullName;
        branchInput.value = leetcodeRepo.defaultBranch || 'main';
      }
    }

    goToStep(2);
  } catch (err) {
    showAlert(`Login failed: ${err.message}`, 'error', 7000);
  } finally {
    btnLoginStep1.disabled = false;
    btnLoginStep1.innerHTML = 'Log In with GitHub &rarr;';
  }
}

/**
 * Handle Creating a new repository in Step 2
 */
async function handleCreateRepo() {
  const repoName = newRepoName.value.trim();
  const isPrivate = newRepoPrivate.checked;

  if (!repoName) {
    showAlert('Please enter a repository name.', 'error');
    newRepoName.focus();
    return;
  }

  btnCreateRepoAction.disabled = true;
  btnCreateRepoAction.textContent = 'Creating repository on GitHub...';

  try {
    const created = await createRepository(state.token, repoName, isPrivate);
    manualRepoInput.value = created.fullName;
    branchInput.value = created.defaultBranch || 'main';
    switchRepoTab('existing');

    if (repoDropdown) {
      const opt = document.createElement('option');
      opt.value = created.fullName;
      opt.textContent = `${created.fullName} (Newly Created)`;
      opt.selected = true;
      repoDropdown.prepend(opt);
    }

    showAlert(`✓ Repository "${created.fullName}" created successfully!`, 'success', 4000);
  } catch (err) {
    showAlert(`Failed to create repository: ${err.message}`, 'error', 7000);
  } finally {
    btnCreateRepoAction.disabled = false;
    btnCreateRepoAction.textContent = '✨ Create Repository on GitHub';
  }
}

/**
 * Handle Step 2 Next
 */
function handleStep2Next() {
  let targetRepo = manualRepoInput.value.trim() || repoDropdown.value;

  if (!targetRepo) {
    showAlert('Please select or enter a target repository.', 'error');
    return;
  }

  if (!targetRepo.includes('/')) {
    targetRepo = `${state.user.login}/${targetRepo}`;
    manualRepoInput.value = targetRepo;
  }

  state.selectedRepo = targetRepo;
  state.branch = branchInput.value.trim() || 'main';
  state.folderFormat = folderFormat.value;

  // Populate Step 3 Summary
  if (summaryUser) summaryUser.textContent = `@${state.user.login}`;
  if (summaryRepo) summaryRepo.textContent = state.selectedRepo;
  if (summaryBranch) summaryBranch.textContent = state.branch;
  if (summaryFolder) summaryFolder.textContent = state.folderFormat === 'difficulty' ? 'Difficulty/0001-slug/' : '0001-slug/';

  goToStep(3);
}

/**
 * Handle Step 3 Authorize & Save
 */
async function handleStep3Authorize() {
  btnAuthorizeFinish.disabled = true;
  btnAuthorizeFinish.innerHTML = 'Verifying permissions & Authorizing...';
  hideAlert();

  try {
    const [owner, repo] = state.selectedRepo.split('/');
    const repoData = await checkRepository(state.token, owner, repo);

    if (!repoData.hasPushPermission) {
      throw new Error(`Token does not have push permission to ${state.selectedRepo}. Make sure your PAT has "Contents: Read & write" permission.`);
    }

    // Save to unified storage
    await storage.set({
      github_pat: state.token,
      github_repo: state.selectedRepo,
      github_branch: state.branch,
      github_user: state.user,
      folder_format: state.folderFormat
    });

    showSuccessView(state.selectedRepo);
  } catch (err) {
    showAlert(`Authorization failed: ${err.message}`, 'error', 8000);
  } finally {
    btnAuthorizeFinish.disabled = false;
    btnAuthorizeFinish.innerHTML = 'Authorize & Start Syncing 🚀';
  }
}

function showSuccessView(repo) {
  if (successRepoLink) successRepoLink.textContent = repo;
  if (successGithubBtn) successGithubBtn.href = `https://github.com/${repo}`;
  goToStep(4);
}
