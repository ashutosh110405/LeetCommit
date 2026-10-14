/**
 * Injected Script (MAIN World)
 * Runs directly in the LeetCode page execution context to intercept
 * submission events and results via fetch / XMLHttpRequest.
 * 
 * Accurately extracts 100% full source code directly from LeetCode submit payloads
 * and Monaco Editor memory models, preserving all lines, formatting, and indentation
 * without DOM virtualization limits.
 */

(function () {
  'use strict';

  // In-flight tracking
  const pendingSubmissions = new Map(); // submissionId -> payload
  const pendingRunCodes = new Set();    // interpretId set
  const handledSubmissionIds = new Set();

  let lastSubmitPayload = null;

  function extractSlugFromUrl(url) {
    if (!url) return '';
    const match = url.match(/\/problems\/([^/?#]+)/);
    return match ? match[1] : '';
  }

  /**
   * Safely extract problem metadata directly from LeetCode's Next.js page state (window.__NEXT_DATA__)
   */
  function getProblemMetadata(slug) {
    try {
      if (window.__NEXT_DATA__ && window.__NEXT_DATA__.props && window.__NEXT_DATA__.props.pageProps) {
        const pageProps = window.__NEXT_DATA__.props.pageProps;

        // Check React Query cache in dehydratedState
        const queries = pageProps.dehydratedState?.queries || [];
        for (const q of queries) {
          const question = q?.state?.data?.question;
          if (question && (!slug || question.titleSlug === slug)) {
            return {
              questionId: question.questionFrontendId || question.questionId,
              title: question.title,
              titleSlug: question.titleSlug,
              difficulty: question.difficulty,
              content: question.content,
              topicTags: (question.topicTags || []).map(t => t.name)
            };
          }
        }

        // Check direct pageProps.question
        if (pageProps.question) {
          const question = pageProps.question;
          return {
            questionId: question.questionFrontendId || question.questionId,
            title: question.title,
            titleSlug: question.titleSlug,
            difficulty: question.difficulty,
            content: question.content,
            topicTags: (question.topicTags || []).map(t => t.name)
          };
        }
      }
    } catch (e) {
      console.warn('[LeetCommit] __NEXT_DATA__ metadata extraction error:', e);
    }
    return null;
  }

  /**
   * Safely extract the COMPLETE, full source code from Monaco Editor's memory model
   * Preserves every single line, indent, newline, and character without DOM virtualization limits.
   */
  function getFullMonacoCode() {
    try {
      if (window.monaco && window.monaco.editor) {
        // Priority 1: Check active/mounted Monaco editor instances
        const editors = window.monaco.editor.getEditors ? window.monaco.editor.getEditors() : [];
        for (const ed of editors) {
          const model = ed.getModel ? ed.getModel() : null;
          if (model) {
            const lang = (model.getLanguageId ? model.getLanguageId() : '') || '';
            const val = model.getValue ? model.getValue() : '';
            // If language is a recognized programming language and not plaintext/json/markdown
            if (lang && !['plaintext', 'json', 'markdown', 'text', 'yaml'].includes(lang.toLowerCase()) && val.trim().length > 0) {
              return val;
            }
          }
        }

        // Priority 2: Check all memory models in Monaco, prioritizing code models
        const models = window.monaco.editor.getModels ? window.monaco.editor.getModels() : [];
        let bestCode = '';
        let maxLen = 0;

        for (const m of models) {
          const lang = (m.getLanguageId ? m.getLanguageId() : '').toLowerCase();
          const val = m.getValue ? m.getValue() : '';
          const len = val.trim().length;

          // Exclude plaintext/json testcase models
          const isCodeLang = lang && !['plaintext', 'json', 'markdown', 'text', 'yaml'].includes(lang);
          if (isCodeLang && len > maxLen) {
            bestCode = val;
            maxLen = len;
          }
        }

        if (bestCode) return bestCode;

        // Priority 3: Fallback to model with largest value
        for (const m of models) {
          const val = m.getValue ? m.getValue() : '';
          if (val.trim().length > maxLen) {
            bestCode = val;
            maxLen = val.trim().length;
          }
        }
        return bestCode;
      }
    } catch (e) {
      console.warn('[LeetCommit] Monaco getValue error:', e);
    }
    return '';
  }

  /**
   * Match string against all known LeetCode language names and slugs
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
   * Auto-detect the currently selected language from the page execution context
   */
  function detectActiveLanguage() {
    if (window.monaco && window.monaco.editor) {
      try {
        const editors = window.monaco.editor.getEditors ? window.monaco.editor.getEditors() : [];
        for (const ed of editors) {
          const model = ed.getModel ? ed.getModel() : null;
          if (model) {
            const langId = model.getLanguageId ? model.getLanguageId() : '';
            const mapped = matchLanguageName(langId);
            if (mapped) return mapped;
          }
        }

        const models = window.monaco.editor.getModels ? window.monaco.editor.getModels() : [];
        for (const m of models) {
          const langId = m.getLanguageId ? m.getLanguageId() : '';
          const mapped = matchLanguageName(langId);
          if (mapped) return mapped;
        }
      } catch {}
    }

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

    const buttons = document.querySelectorAll('button');
    for (const b of buttons) {
      const text = (b.textContent || '').trim();
      if (text.length > 0 && text.length < 30) {
        const mapped = matchLanguageName(text);
        if (mapped) return mapped;
      }
    }

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

    return 'python3';
  }

  // Handle direct code requests from content script
  window.addEventListener('message', (event) => {
    if (event.data && event.data.source === 'LEETCOMMIT_GET_FULL_CODE') {
      const fullCode = getFullMonacoCode();
      window.postMessage({
        source: 'LEETCOMMIT_FULL_CODE_RESPONSE',
        code: fullCode
      }, '*');
    }
  });

  function handleCheckResponse(id, data) {
    if (!data || !id) return;

    const idStr = String(id);

    // CASE 1: It was a "Run Code" (interpretation / testcases)
    if (pendingRunCodes.has(idStr)) {
      if (data.state === 'SUCCESS') {
        pendingRunCodes.delete(idStr);

        if (data.status_msg === 'Accepted' || data.run_success === true) {
          window.postMessage({
            source: 'LEETSYNC_INJECT',
            action: 'RUN_CODE_ACCEPTED',
            data: {
              titleSlug: extractSlugFromUrl(window.location.href),
              totalCorrect: data.total_correct || null,
              totalTestcases: data.total_testcases || null,
              runtime: data.status_runtime || data.pretty_runtime || ''
            }
          }, '*');
        }
      }
      return;
    }

    // CASE 2: It was a real "Submit Code"
    if (pendingSubmissions.has(idStr) || (data.submission_id && pendingSubmissions.has(String(data.submission_id)))) {
      if (handledSubmissionIds.has(idStr)) return;

      if (data.state === 'SUCCESS') {
        if (data.status_msg === 'Accepted') {
          handledSubmissionIds.add(idStr);

          const cached = pendingSubmissions.get(idStr) || 
                         (data.submission_id ? pendingSubmissions.get(String(data.submission_id)) : null) || 
                         lastSubmitPayload || {};

          const currentSlug = cached.titleSlug || extractSlugFromUrl(window.location.href);

          // Language determination
          const detectedLang = matchLanguageName(data.lang) || 
                               matchLanguageName(cached.lang) || 
                               detectActiveLanguage();

          // Full code: prefer submitted typed_code or longest Monaco code
          const monacoCode = getFullMonacoCode();
          let finalCode = cached.code || '';
          if (!finalCode || (monacoCode && monacoCode.trim().length > finalCode.trim().length)) {
            finalCode = monacoCode;
          }

          // Problem metadata
          const meta = getProblemMetadata(currentSlug);

          const acceptedPayload = {
            submissionId: idStr,
            questionId: meta?.questionId || cached.questionId || data.question_id || null,
            title: meta?.title || null,
            titleSlug: currentSlug,
            difficulty: meta?.difficulty || null,
            contentHtml: meta?.content || null,
            topicTags: meta?.topicTags || [],
            lang: detectedLang,
            code: finalCode,
            runtime: data.status_runtime || data.pretty_runtime || '',
            runtimePercentile: data.runtime_percentile ? Number(data.runtime_percentile).toFixed(1) : null,
            memory: data.status_memory || data.pretty_memory || '',
            memoryPercentile: data.memory_percentile ? Number(data.memory_percentile).toFixed(1) : null,
            timestamp: Date.now()
          };

          // Notify content script to commit
          window.postMessage({
            source: 'LEETSYNC_INJECT',
            action: 'SUBMISSION_ACCEPTED',
            data: acceptedPayload
          }, '*');

          setTimeout(() => pendingSubmissions.delete(idStr), 60000);
        }
      }
    }
  }

  // 1. Intercept window.fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const resource = args[0];
    const options = args[1] || {};
    const url = typeof resource === 'string' ? resource : (resource?.url || '');

    // SUBMIT: POST /problems/<slug>/submit/
    if (typeof url === 'string' && url.includes('/problems/') && url.includes('/submit/')) {
      const slug = extractSlugFromUrl(url) || extractSlugFromUrl(window.location.href);
      const monacoCode = getFullMonacoCode();
      const currentLang = detectActiveLanguage();

      let submitBody = null;
      if (options && options.body) {
        try {
          submitBody = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
        } catch (err) {
          console.warn('[LeetCommit] Error parsing options.body:', err);
        }
      } else if (resource instanceof Request) {
        try {
          submitBody = await resource.clone().json();
        } catch (err) {
          console.warn('[LeetCommit] Error reading Request body:', err);
        }
      }

      const matchedLang = (submitBody && matchLanguageName(submitBody.lang)) || currentLang;
      // typed_code is the exact, complete, un-truncated code submitted to LeetCode
      const submittedCode = (submitBody && typeof submitBody.typed_code === 'string' && submitBody.typed_code.trim().length > 0)
        ? submitBody.typed_code
        : monacoCode;

      lastSubmitPayload = {
        titleSlug: slug,
        questionId: submitBody?.question_id || null,
        lang: matchedLang,
        code: submittedCode,
        timestamp: Date.now()
      };

      const response = await originalFetch.apply(this, args);

      try {
        const clone = response.clone();
        clone.json().then(data => {
          if (data && data.submission_id && lastSubmitPayload) {
            if (!lastSubmitPayload.code || lastSubmitPayload.code.trim().length < 5) {
              lastSubmitPayload.code = getFullMonacoCode();
            }
            pendingSubmissions.set(String(data.submission_id), { ...lastSubmitPayload });
          }
        }).catch(() => {});
      } catch {}

      return response;
    }

    // RUN CODE: POST /problems/<slug>/interpret_solution/
    if (typeof url === 'string' && (url.includes('/interpret_solution/') || url.includes('/interpret/'))) {
      const response = await originalFetch.apply(this, args);

      try {
        const clone = response.clone();
        clone.json().then(data => {
          const interpretId = data.interpret_id || data.interpret_expected_id;
          if (interpretId) {
            pendingRunCodes.add(String(interpretId));
          }
        }).catch(() => {});
      } catch {}

      return response;
    }

    // CHECK RESULT: GET /submissions/detail/<id>/check/
    if (typeof url === 'string' && url.includes('/submissions/detail/') && url.includes('/check/')) {
      const response = await originalFetch.apply(this, args);

      try {
        const match = url.match(/\/submissions\/detail\/([^/?#]+)\/check/);
        const checkId = match ? match[1] : null;

        if (checkId) {
          const clone = response.clone();
          clone.json().then(data => {
            handleCheckResponse(checkId, data);
          }).catch(() => {});
        }
      } catch (err) {
        console.warn('[LeetCommit] Error reading check result:', err);
      }

      return response;
    }

    return originalFetch.apply(this, args);
  };

  // 2. Intercept XMLHttpRequest as fallback
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._lcUrl = url;
    this._lcMethod = method;
    return originalOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const url = this._lcUrl;

    // SUBMIT
    if (typeof url === 'string' && url.includes('/problems/') && url.includes('/submit/')) {
      const slug = extractSlugFromUrl(url) || extractSlugFromUrl(window.location.href);
      const monacoCode = getFullMonacoCode();
      const currentLang = detectActiveLanguage();

      let submitBody = null;
      try {
        if (body && typeof body === 'string') {
          submitBody = JSON.parse(body);
        }
      } catch {}

      const matchedLang = (submitBody && matchLanguageName(submitBody.lang)) || currentLang;
      const submittedCode = (submitBody && typeof submitBody.typed_code === 'string' && submitBody.typed_code.trim().length > 0)
        ? submitBody.typed_code
        : monacoCode;

      lastSubmitPayload = {
        titleSlug: slug,
        questionId: submitBody?.question_id || null,
        lang: matchedLang,
        code: submittedCode,
        timestamp: Date.now()
      };

      this.addEventListener('load', function () {
        try {
          const data = JSON.parse(this.responseText);
          if (data && data.submission_id && lastSubmitPayload) {
            if (!lastSubmitPayload.code || lastSubmitPayload.code.trim().length < 5) {
              lastSubmitPayload.code = getFullMonacoCode();
            }
            pendingSubmissions.set(String(data.submission_id), { ...lastSubmitPayload });
          }
        } catch {}
      });
    }

    // RUN CODE
    if (typeof url === 'string' && (url.includes('/interpret_solution/') || url.includes('/interpret/'))) {
      this.addEventListener('load', function () {
        try {
          const data = JSON.parse(this.responseText);
          const interpretId = data.interpret_id || data.interpret_expected_id;
          if (interpretId) {
            pendingRunCodes.add(String(interpretId));
          }
        } catch {}
      });
    }

    // CHECK
    if (typeof url === 'string' && url.includes('/submissions/detail/') && url.includes('/check/')) {
      const match = url.match(/\/submissions\/detail\/([^/?#]+)\/check/);
      const checkId = match ? match[1] : null;

      if (checkId) {
        this.addEventListener('load', function () {
          try {
            const data = JSON.parse(this.responseText);
            handleCheckResponse(checkId, data);
          } catch {}
        });
      }
    }

    return originalSend.apply(this, [body]);
  };

  console.log('[LeetCommit] Full Monaco memory & submit payload code extractor active.');
})();
