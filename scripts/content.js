/**
 * Content Script (ISOLATED World)
 * Coordinates problem data extraction, handles messages from inject.js,
 * communicates with the background service worker, and shows in-page toasts.
 */

(function () {
  'use strict';

  let toastContainer = null;
  const processedSubmissions = new Set();

  /**
   * Initialize or retrieve toast container
   */
  function getToastContainer() {
    if (!toastContainer || !document.body.contains(toastContainer)) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'leetcommit-toast-container';
      document.body.appendChild(toastContainer);
    }
    return toastContainer;
  }

  /**
   * Display a floating toast notification on the LeetCode page
   */
  function showToast({ title, message, type = 'syncing', linkUrl = null, linkText = null, autoDismiss = 7000 }) {
    const container = getToastContainer();
    const toast = document.createElement('div');
    toast.className = `leetcommit-toast ${type}`;

    let iconHtml = '';
    if (type === 'syncing') {
      iconHtml = '<span class="lc-spinner"></span>';
    } else if (type === 'success') {
      iconHtml = '✓';
    } else {
      iconHtml = '✕';
    }

    let linkHtml = '';
    if (linkUrl) {
      linkHtml = `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer" class="leetcommit-toast-link">
        ${linkText || 'View on GitHub'} ↗
      </a>`;
    }

    toast.innerHTML = `
      <div class="leetcommit-toast-icon">${iconHtml}</div>
      <div class="leetcommit-toast-body">
        <div class="leetcommit-toast-title">${title}</div>
        <div class="leetcommit-toast-message">${message}</div>
        ${linkHtml}
      </div>
      <button class="leetcommit-toast-close" title="Close">&times;</button>
    `;

    const closeBtn = toast.querySelector('.leetcommit-toast-close');
    closeBtn.addEventListener('click', () => {
      dismissToast(toast);
    });

    container.appendChild(toast);
    // Trigger slide-in
    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    let dismissTimer = null;
    if (autoDismiss && autoDismiss > 0) {
      dismissTimer = setTimeout(() => {
        dismissToast(toast);
      }, autoDismiss);
    }

    return {
      element: toast,
      update: (newOpts) => {
        if (dismissTimer) clearTimeout(dismissTimer);

        if (newOpts.type) {
          toast.className = `leetcommit-toast visible ${newOpts.type}`;
          const iconEl = toast.querySelector('.leetcommit-toast-icon');
          if (newOpts.type === 'syncing') iconEl.innerHTML = '<span class="lc-spinner"></span>';
          else if (newOpts.type === 'success') iconEl.innerHTML = '✓';
          else iconEl.innerHTML = '✕';
        }

        if (newOpts.title) {
          toast.querySelector('.leetcommit-toast-title').textContent = newOpts.title;
        }

        if (newOpts.message) {
          toast.querySelector('.leetcommit-toast-message').textContent = newOpts.message;
        }

        const bodyEl = toast.querySelector('.leetcommit-toast-body');
        const existingLink = bodyEl.querySelector('.leetcommit-toast-link');
        if (existingLink) existingLink.remove();

        if (newOpts.linkUrl) {
          const a = document.createElement('a');
          a.href = newOpts.linkUrl;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.className = 'leetcommit-toast-link';
          a.innerHTML = `${newOpts.linkText || 'View on GitHub'} &nearr;`;
          bodyEl.appendChild(a);
        }

        if (newOpts.autoDismiss) {
          setTimeout(() => dismissToast(toast), newOpts.autoDismiss);
        }
      },
      dismiss: () => dismissToast(toast)
    };
  }

  function dismissToast(toast) {
    if (!toast) return;
    toast.classList.remove('visible');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  /**
   * Fetch problem details from LeetCode's public GraphQL endpoint
   */
  async function fetchProblemDetails(titleSlug) {
    const isCn = window.location.hostname.includes('leetcode.cn');
    const endpoint = isCn ? 'https://leetcode.cn/graphql' : 'https://leetcode.com/graphql';

    const query = `
      query getQuestionDetail($titleSlug: String!) {
        question(titleSlug: $titleSlug) {
          questionId
          questionFrontendId
          title
          titleSlug
          content
          difficulty
          topicTags {
            name
            slug
          }
        }
      }
    `;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query,
          variables: { titleSlug },
          operationName: 'getQuestionDetail'
        })
      });

      if (!response.ok) return null;
      const json = await response.json();
      return json?.data?.question || null;
    } catch (err) {
      console.warn('[LeetCommit] GraphQL query failed:', err);
      return null;
    }
  }

  /**
   * Fallback problem scraper directly from DOM and document.title
   */
  function scrapeProblemFromDom() {
    let title = '';
    let questionId = '';
    let difficulty = 'Medium';
    let contentHtml = '';

    // 1. Check document.title (e.g. "1. Two Sum - LeetCode")
    const docTitle = document.title || '';
    const docMatch = docTitle.match(/^(\d+)\.\s*([^-]+)/);
    if (docMatch) {
      questionId = docMatch[1].trim();
      title = docMatch[2].trim();
    }

    // 2. Try finding title from header/breadcrumbs if not in document.title
    if (!title || !questionId) {
      const titleElem = document.querySelector('div[class*="text-title-large"], [data-cy="question-title"], .text-title-large, a[href*="/problems/"]');
      if (titleElem) {
        const text = titleElem.textContent.trim();
        const match = text.match(/^(\d+)\.\s*(.+)$/);
        if (match) {
          questionId = match[1];
          title = match[2];
        } else if (!title) {
          title = text;
        }
      }
    }

    // 3. Check all heading tags if questionId still not found
    if (!questionId) {
      const possibleHeaders = document.querySelectorAll('h1, h2, h3, h4, [class*="title"], [class*="heading"]');
      for (const h of possibleHeaders) {
        const m = (h.textContent || '').trim().match(/^(\d+)\.\s*(.+)$/);
        if (m) {
          questionId = m[1];
          if (!title) title = m[2];
          break;
        }
      }
    }

    if (!title) {
      title = docTitle.replace(/\s*-\s*LeetCode.*$/i, '').trim();
    }

    // 4. Try finding difficulty
    const diffElem = document.querySelector('div[class*="text-difficulty-"], div[class*="text-olive"], div[class*="text-yellow"], div[class*="text-pink"], [data-difficulty]');
    if (diffElem) {
      const diffText = diffElem.textContent.trim();
      if (/Easy/i.test(diffText)) difficulty = 'Easy';
      else if (/Hard/i.test(diffText)) difficulty = 'Hard';
      else if (/Medium/i.test(diffText)) difficulty = 'Medium';
    }

    // 5. Try finding description content
    const descElem = document.querySelector('div[data-track-load="description_content"], div[class*="elfjS"], div[class*="description__"], .question-content');
    if (descElem) {
      contentHtml = descElem.innerHTML;
    }

    return { title, questionId, difficulty, contentHtml };
  }

  // Cache latest full code received from inject.js
  let latestFullMonacoCode = '';
  window.addEventListener('message', (event) => {
    if (event.data && event.data.source === 'LEETCOMMIT_FULL_CODE_RESPONSE') {
      if (event.data.code && event.data.code.trim().length > 0) {
        latestFullMonacoCode = event.data.code;
      }
    }
  });

  /**
   * Fetch 100% full solution code & details from LeetCode GraphQL API
   */
  async function fetchSubmissionDetails(submissionId) {
    if (!submissionId) return null;
    const idNum = parseInt(submissionId, 10);
    if (isNaN(idNum) || idNum <= 0) return null;

    const query = `
      query submissionDetails($submissionId: Int!) {
        submissionDetails(submissionId: $submissionId) {
          runtime
          runtimeDisplay
          runtimePercentile
          memory
          memoryDisplay
          memoryPercentile
          code
          timestamp
          statusCode
          lang {
            name
            verboseName
          }
          question {
            questionId
            title
            titleSlug
            content
            difficulty
            topicTags {
              name
              slug
            }
          }
        }
      }
    `;

    try {
      const isCn = window.location.hostname.includes('leetcode.cn');
      const endpoint = isCn ? 'https://leetcode.cn/graphql/' : 'https://leetcode.com/graphql/';
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query,
          variables: { submissionId: idNum },
          operationName: 'submissionDetails'
        })
      });

      if (!response.ok) return null;
      const json = await response.json();
      return json?.data?.submissionDetails || null;
    } catch (err) {
      console.warn('[LeetCommit] fetchSubmissionDetails error:', err);
      return null;
    }
  }

  /**
   * Fetch question details (questionFrontendId, title, etc.) via GraphQL
   */
  async function fetchQuestionDetail(titleSlug) {
    if (!titleSlug) return null;
    const query = `
      query questionDetail($titleSlug: String!) {
        question(titleSlug: $titleSlug) {
          questionFrontendId
          questionId
          title
          titleSlug
          difficulty
          content
          topicTags {
            name
            slug
          }
        }
      }
    `;

    try {
      const isCn = window.location.hostname.includes('leetcode.cn');
      const endpoint = isCn ? 'https://leetcode.cn/graphql/' : 'https://leetcode.com/graphql/';
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query,
          variables: { titleSlug },
          operationName: 'questionDetail'
        })
      });

      if (!response.ok) return null;
      const json = await response.json();
      return json?.data?.question || null;
    } catch (err) {
      console.warn('[LeetCommit] fetchQuestionDetail error:', err);
      return null;
    }
  }

  /**
   * Extract code directly from DOM elements as a fallback
   */
  function getCodeFromDom() {
    // 1. Check <code> tags in submission details panel
    const codeTags = document.getElementsByTagName('code');
    if (codeTags && codeTags.length > 0) {
      for (let i = 0; i < codeTags.length; i++) {
        const text = (codeTags[i].innerText || '').trim();
        if (text.length > 15) return text;
      }
    }
    // 2. Check <pre> tags
    const preTags = document.getElementsByTagName('pre');
    if (preTags && preTags.length > 0) {
      for (let i = 0; i < preTags.length; i++) {
        const text = (preTags[i].innerText || '').trim();
        if (text.length > 15) return text;
      }
    }
    return '';
  }

  /**
   * Request 100% full code from Monaco Editor via inject.js
   */
  function requestFullCode() {
    return new Promise((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          window.removeEventListener('message', handler);
          resolve(latestFullMonacoCode || '');
        }
      }, 350);

      function handler(event) {
        if (event.data && event.data.source === 'LEETCOMMIT_FULL_CODE_RESPONSE') {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            window.removeEventListener('message', handler);
            if (event.data.code && event.data.code.trim().length > 0) {
              latestFullMonacoCode = event.data.code;
            }
            resolve(latestFullMonacoCode || '');
          }
        }
      }

      window.addEventListener('message', handler);
      window.postMessage({ source: 'LEETCOMMIT_GET_FULL_CODE' }, '*');
    });
  }

  /**
   * Handle accepted submission from inject.js, DOM observer, or URL navigation
   */
  async function handleAcceptedSubmission(submission) {
    const submissionId = submission.submissionId;
    const titleSlug = submission.titleSlug || window.location.pathname.match(/\/problems\/([^/?#]+)/)?.[1] || '';
    if (!titleSlug) return;

    // Deduplicate submissions
    const dedupeKey = `sub_${titleSlug}_${submissionId || Date.now()}`;
    if (processedSubmissions.has(dedupeKey)) return;
    processedSubmissions.add(dedupeKey);

    const toast = showToast({
      title: 'LeetCommit: Accepted! ✓',
      message: `Fetching verified solution for "${titleSlug}"...`,
      type: 'syncing',
      autoDismiss: 0
    });

    let code = submission.code || '';
    let lang = submission.lang || '';
    let runtime = submission.runtime || '';
    let runtimePercentile = submission.runtimePercentile || null;
    let memory = submission.memory || '';
    let memoryPercentile = submission.memoryPercentile || null;
    let question = null;

    // STEP 1: Query LeetCode GraphQL using submissionId
    if (submissionId && !String(submissionId).startsWith('dom_')) {
      try {
        const subDetails = await fetchSubmissionDetails(submissionId);
        if (subDetails) {
          if (subDetails.code && subDetails.code.trim().length > 0) {
            code = subDetails.code; // 100% full pristine code from LeetCode DB!
          }
          if (subDetails.lang?.name) {
            lang = subDetails.lang.name;
          }
          if (subDetails.runtimeDisplay) {
            runtime = subDetails.runtimeDisplay;
          }
          if (subDetails.runtimePercentile) {
            runtimePercentile = Math.round((subDetails.runtimePercentile + Number.EPSILON) * 10) / 10;
          }
          if (subDetails.memoryDisplay) {
            memory = subDetails.memoryDisplay;
          }
          if (subDetails.memoryPercentile) {
            memoryPercentile = Math.round((subDetails.memoryPercentile + Number.EPSILON) * 10) / 10;
          }
          if (subDetails.question) {
            question = subDetails.question;
          }
        }
      } catch (err) {
        console.warn('[LeetCommit] Error fetching submission details:', err);
      }
    }

    // STEP 2: Fallback to DOM <code> tags if code is still missing
    if (!code || code.trim().length === 0) {
      code = getCodeFromDom();
    }

    // STEP 3: Fallback to Monaco memory buffer from inject.js
    if (!code || code.trim().length === 0) {
      code = await requestFullCode();
    }

    // CRITICAL PROTECTION: NEVER PUSH BLANK CODE!
    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      console.error('[LeetCommit] Could not extract solution code. Push aborted to prevent blank code.');
      toast.update({
        title: 'LeetCommit: Code Not Found',
        message: 'Could not extract solution code from LeetCode. Push aborted to prevent blank code.',
        type: 'error',
        autoDismiss: 8000
      });
      return;
    }

    // STEP 4: Fetch question details (frontend problem number, e.g. 1, 142)
    let qDetail = null;
    try {
      qDetail = await fetchQuestionDetail(titleSlug);
    } catch {}

    const frontendId = qDetail?.questionFrontendId || question?.questionFrontendId || question?.questionId || submission.questionId || '0';
    const problemTitle = qDetail?.title || question?.title || submission.title || titleSlug;
    const difficulty = qDetail?.difficulty || question?.difficulty || submission.difficulty || 'Medium';
    const content = qDetail?.content || question?.content || submission.contentHtml || '';
    const topicTags = qDetail?.topicTags || question?.topicTags || submission.topicTags || [];

    // STEP 5: Convert HTML description to clean Markdown
    let markdownDesc = '';
    if (content && window.LeetCodeParser) {
      markdownDesc = window.LeetCodeParser.htmlToMarkdown(content);
    } else {
      markdownDesc = content || 'No problem description available.';
    }

    const finalLang = matchLanguageName(lang) || detectLanguageFromDom() || 'python3';

    const payload = {
      questionId: frontendId,
      titleSlug: titleSlug,
      title: problemTitle,
      difficulty: difficulty,
      code: code.trim(),
      lang: finalLang,
      runtime: runtime,
      runtimePercentile: runtimePercentile,
      memory: memory,
      memoryPercentile: memoryPercentile,
      markdownDescription: markdownDesc,
      topicTags: topicTags.map(t => typeof t === 'string' ? t : t.name),
      url: window.location.href.split('?')[0].split('#')[0]
    };

    toast.update({
      title: 'LeetCommit: Pushing to GitHub...',
      message: `Uploading complete ${payload.lang} solution for "${payload.title}" (${payload.code.split('\n').length} lines)...`,
      type: 'syncing',
      autoDismiss: 0
    });

    // STEP 6: Send to background service worker to commit to GitHub
    chrome.runtime.sendMessage({
      action: 'SYNC_SOLUTION',
      problemData: payload
    }, (response) => {
      if (chrome.runtime.lastError) {
        toast.update({
          title: 'LeetCommit Error',
          message: chrome.runtime.lastError.message,
          type: 'error',
          autoDismiss: 8000
        });
        return;
      }

      if (response && response.success) {
        if (response.alreadySynced) {
          toast.update({
            title: 'Already Up-to-Date! ✓',
            message: `"${payload.title}" is already pushed to GitHub with identical code (no duplicate push).`,
            type: 'success',
            linkUrl: response.htmlUrl,
            linkText: 'View on GitHub',
            autoDismiss: 6000
          });
        } else {
          toast.update({
            title: 'Synced to GitHub! ✓',
            message: `Successfully pushed "${payload.title}" (${payload.code.split('\n').length} lines) to ${response.repo}`,
            type: 'success',
            linkUrl: response.htmlUrl,
            linkText: 'Open in GitHub',
            autoDismiss: 8000
          });
        }
      } else {
        toast.update({
          title: 'LeetCommit Sync Failed',
          message: response?.error || 'Could not commit to GitHub. Check your PAT permissions in the popup.',
          type: 'error',
          autoDismiss: 10000
        });
      }
    });
  }

  let lastClickedAction = null;

  // Track button clicks to distinguish between Run Code and Submit Code
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button, [role="button"]');
    if (!btn) return;
    const text = (btn.textContent || '').trim().toLowerCase();
    if (text === 'run' || text.includes('run code') || btn.getAttribute('data-e2e-locator') === 'console-run-button') {
      lastClickedAction = 'run';
    } else if (text === 'submit' || text.includes('submit code') || btn.getAttribute('data-e2e-locator') === 'console-submit-button') {
      lastClickedAction = 'submit';
    }
  }, true);

  /**
   * DOM MutationObserver fallback to catch "Accepted" state
   */
  function setupDomObserver() {
    let debounceTimer = null;
    const observer = new MutationObserver(() => {
      if (debounceTimer) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        checkDomForAccepted();
      }, 1200);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  /**
   * Match string against all known LeetCode languages
   */
  function matchLanguageName(str) {
    if (!str || typeof str !== 'string') return null;
    const clean = str.trim().toLowerCase();

    // Exact matches
    if (clean === 'c++' || clean === 'cpp') return 'cpp';
    if (clean === 'c#' || clean === 'csharp' || clean === 'cs') return 'csharp';
    if (clean === 'python3' || clean === 'py3') return 'python3';
    if (clean === 'python' || clean === 'py') return 'python';
    if (clean === 'javascript' || clean === 'js') return 'javascript';
    if (clean === 'typescript' || clean === 'ts') return 'typescript';
    if (clean === 'golang' || clean === 'go') return 'golang';
    if (clean === 'java') return 'java';
    if (clean === 'c') return 'c';
    if (clean === 'kotlin' || clean === 'kt') return 'kotlin';
    if (clean === 'swift') return 'swift';
    if (clean === 'rust' || clean === 'rs') return 'rust';
    if (clean === 'ruby' || clean === 'rb') return 'ruby';
    if (clean === 'php') return 'php';
    if (clean === 'dart') return 'dart';
    if (clean === 'scala') return 'scala';
    if (clean === 'elixir' || clean === 'ex') return 'elixir';
    if (clean === 'erlang' || clean === 'erl') return 'erlang';
    if (clean === 'racket' || clean === 'rkt') return 'racket';
    if (clean === 'mysql' || clean === 'sql' || clean === 'postgresql' || clean === 'mssql') return 'sql';

    // Substring matches for UI elements
    if (/\bc\+\+/i.test(clean) || /\bcpp\b/i.test(clean)) return 'cpp';
    if (/\bc#/i.test(clean) || /\bcsharp\b/i.test(clean)) return 'csharp';
    if (/\bpython3\b/i.test(clean)) return 'python3';
    if (/\bpython\b/i.test(clean)) return 'python';
    if (/\btypescript\b/i.test(clean)) return 'typescript';
    if (/\bjavascript\b/i.test(clean)) return 'javascript';
    if (/\bjava\b/i.test(clean) && !clean.includes('script')) return 'java';
    if (/\bkotlin\b/i.test(clean)) return 'kotlin';
    if (/\bswift\b/i.test(clean)) return 'swift';
    if (/\brust\b/i.test(clean)) return 'rust';
    if (/\bruby\b/i.test(clean)) return 'ruby';
    if (/\bphp\b/i.test(clean)) return 'php';
    if (/\bdart\b/i.test(clean)) return 'dart';
    if (/\bscala\b/i.test(clean)) return 'scala';
    if (/\belixir\b/i.test(clean)) return 'elixir';
    if (/\berlang\b/i.test(clean)) return 'erlang';
    if (/\bracket\b/i.test(clean)) return 'racket';
    if (/\bgolang\b/i.test(clean) || /\bgo\b/i.test(clean)) return 'golang';
    if (/^c\b/i.test(clean) && !clean.includes('++') && !clean.includes('#')) return 'c';

    return null;
  }

  /**
   * Auto-detect the currently selected language from the DOM
   */
  function detectLanguageFromDom() {
    // 1. Common LeetCode language dropdown selectors
    const selectors = [
      'button[id*="headlessui-listbox-button"]',
      'button[data-cy="lang-select"]',
      'button[aria-haspopup="listbox"]',
      'button[aria-haspopup="menu"]',
      'div[data-mode-id]',
      'div[class*="editor"] button'
    ];

    for (const sel of selectors) {
      const elems = document.querySelectorAll(sel);
      for (const el of elems) {
        const mapped = matchLanguageName(el.textContent);
        if (mapped) return mapped;
      }
    }

    // 2. Scan all buttons on page whose text matches a language
    const buttons = document.querySelectorAll('button');
    for (const b of buttons) {
      const text = (b.textContent || '').trim();
      if (text.length > 0 && text.length < 30) {
        const mapped = matchLanguageName(text);
        if (mapped) return mapped;
      }
    }

    // 3. LocalStorage
    const storageKeys = ['global_lang', 'current_lang', 'last_lang', 'editor_language', 'dynamic_layout_language'];
    for (const k of storageKeys) {
      try {
        const val = localStorage.getItem(k);
        if (val) {
          const mapped = matchLanguageName(val);
          if (mapped) return mapped;
        }
      } catch {}
    }

    return null;
  }

  async function checkDomForAccepted() {
    // Only proceed if user clicked Submit or if submission result container is visible
    const acceptedElem = document.querySelector('[data-e2e-locator="submission-result"]');
    if (acceptedElem && /Accepted/i.test(acceptedElem.textContent)) {
      // If the last clicked action was "Run", DO NOT COMMIT
      if (lastClickedAction === 'run') {
        return;
      }

      // Check if this is the sample testcase result console rather than full submission
      const isConsoleResult = acceptedElem.closest('[data-e2e-locator="console-result"]') || 
                              document.querySelector('[data-layout-path*="/console"]');
      if (isConsoleResult && lastClickedAction !== 'submit') {
        return;
      }

      const slugMatch = window.location.pathname.match(/\/problems\/([^/?#]+)/);
      const titleSlug = slugMatch ? slugMatch[1] : '';
      if (!titleSlug) return;

      // Extract submissionId from URL or DOM links if present
      const urlMatch = window.location.href.match(/\/submissions\/(?:detail\/)?(\d+)/);
      let submissionId = urlMatch ? urlMatch[1] : null;

      if (!submissionId) {
        const links = document.querySelectorAll('a[href*="/submissions/"]');
        for (const a of links) {
          const m = a.href.match(/\/submissions\/(?:detail\/)?(\d+)/);
          if (m) {
            submissionId = m[1];
            break;
          }
        }
      }

      handleAcceptedSubmission({
        submissionId: submissionId || `dom_${titleSlug}_${new Date().toDateString()}`,
        titleSlug: titleSlug
      });
    }
  }

  // Listen for messages from background.js (history state navigation)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'SUBMISSION_ID_NAVIGATED') {
      console.log('[LeetCommit] Received submission ID from navigation:', request.submissionId);
      handleAcceptedSubmission({
        submissionId: request.submissionId,
        titleSlug: request.titleSlug
      });
    }
  });

  // Listen for messages dispatched by inject.js (MAIN world)
  window.addEventListener('message', (event) => {
    if (!event.data || event.data.source !== 'LEETSYNC_INJECT') return;

    // CASE 1: Run Code Accepted -> Show "Ready to submit", DO NOT commit!
    if (event.data.action === 'RUN_CODE_ACCEPTED') {
      showToast({
        title: 'LeetCommit: Test Cases Passed! ✓',
        message: 'Sample test cases passed. Ready to submit! (Click "Submit" to push to GitHub)',
        type: 'success',
        autoDismiss: 5000
      });
      return;
    }

    // CASE 2: Submit Code Accepted -> Commit to GitHub!
    if (event.data.action === 'SUBMISSION_ACCEPTED') {
      handleAcceptedSubmission(event.data.data);
    }
  });

  // Start DOM Observer fallback
  setupDomObserver();

  console.log('[LeetCommit] Content script initialized on LeetCode with Run vs Submit filtering.');
})();
