# LeetCommit — API Specification

This document provides a comprehensive technical reference for all external REST/GraphQL APIs, internal Chrome extension message passing protocols, and persistent storage schemas utilized by **LeetCommit**.

---

## 1. External GitHub REST API Reference

LeetCommit communicates directly with the official GitHub REST API (`https://api.github.com`) using `fetch`.

### 1.1. Common Request Headers
All GitHub API requests include standard authentication and versioning headers:
```http
Authorization: Bearer <github_pat>
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json
```

---

### 1.2. Endpoints Overview

| Endpoint | HTTP Method | Function in `github-api.js` | Purpose |
| :--- | :---: | :--- | :--- |
| `/user` | `GET` | `validateToken(token)` | Verifies PAT validity and retrieves user metadata. |
| `/user/repos` | `GET` | `getUserRepositories(token)` | Lists repositories accessible by the token. |
| `/user/repos` | `POST` | `createRepository(...)` | Creates a new solutions repository if needed. |
| `/repos/{owner}/{repo}` | `GET` | `checkRepository(token, owner, repo)` | Checks repository existence and push permissions. |
| `/repos/{owner}/{repo}/contents/{path}` | `GET` | `getFileDetails(token, owner, repo, path, branch)` | Retrieves existing file SHA and content for diff check. |
| `/repos/{owner}/{repo}/contents/{path}` | `PUT` | `putFile(token, owner, repo, path, ...)` | Commits new or updated file contents. |

---

### 1.3. Endpoint Details

#### `GET /user`
* **Purpose**: Validates token and checks user identity.
* **Success Response (`200 OK`)**:
  ```json
  {
    "login": "octocat",
    "id": 1,
    "name": "The Octocat",
    "avatar_url": "https://avatars.githubusercontent.com/u/1",
    "html_url": "https://github.com/octocat"
  }
  ```
* **Error Handling**: `401 Unauthorized` indicates an expired or invalid token.

---

#### `GET /repos/{owner}/{repo}`
* **Purpose**: Verifies that the designated repository exists and the token possesses write access.
* **Response Attributes Evaluated**:
  ```json
  {
    "full_name": "octocat/leetcode-solutions",
    "default_branch": "main",
    "private": false,
    "permissions": {
      "admin": false,
      "push": true,
      "pull": true
    }
  }
  ```
* **Permission Check**: Verifies `permissions.push === true`.

---

#### `GET /repos/{owner}/{repo}/contents/{path}?ref={branch}`
* **Purpose**: Fetches metadata of the file on GitHub to compare SHAs and check for duplicate submissions.
* **Parameters**:
  * `path` (*string*): URI-encoded file path (e.g. `0001-two-sum/two-sum.py`).
  * `ref` (*query string*): Target branch name (default: `main`).
* **Success Response (`200 OK`)**:
  ```json
  {
    "name": "two-sum.py",
    "path": "0001-two-sum/two-sum.py",
    "sha": "3d211b7f32f00fbe2226eb...",
    "size": 420,
    "content": "Y2xhc3MgU29sdXRpb246CiAgICBkZWYgdHdvU3VtKHNlbGYsIG51bXM6IExpc3RbaW50XSwgdGFyZ2V0OiBpbnQpIC0+IExpc3RbaW50XToKICAgICAgICBzZWVuID0ge30K...",
    "encoding": "base64"
  }
  ```
* **Not Found Response (`404 Not Found`)**: Indicates file does not exist yet (`exists: false, sha: null`).

---

#### `PUT /repos/{owner}/{repo}/contents/{path}`
* **Purpose**: Creates or updates a file directly in the repository via a Git commit.
* **Request Payload**:
  ```json
  {
    "message": "Solve: Two Sum [Easy] (python3)",
    "content": "Y2xhc3MgU29sdXRpb246CiAgICBkZWYgdHdvU3Vt...",
    "branch": "main",
    "sha": "3d211b7f32f00fbe2226eb..."
  }
  ```
  *(Note: `sha` is only included if updating an existing file).*
* **Success Response (`200 OK` or `201 Created`)**:
  ```json
  {
    "content": {
      "name": "two-sum.py",
      "path": "0001-two-sum/two-sum.py",
      "html_url": "https://github.com/octocat/leetcode-solutions/blob/main/0001-two-sum/two-sum.py"
    },
    "commit": {
      "sha": "76384fc9978b02b6d8518e89087123d80f55ee8",
      "html_url": "https://github.com/octocat/leetcode-solutions/commit/76384fc9978b02b6d8518e89087123d80f55ee8"
    }
  }
  ```

---

## 2. LeetCode APIs (Intercepted & Queried)

### 2.1. Intercepted Network Routes (`inject.js`)

#### Submission Initiation
* **Endpoint Pattern**: `POST https://leetcode.com/problems/{titleSlug}/submit/`
* **Intercepted Payload**:
  ```json
  {
    "lang": "python3",
    "question_id": "1",
    "typed_code": "class Solution:\n    def twoSum(...): ...",
    "question_slug": "two-sum"
  }
  ```
* **Returned Body**:
  ```json
  { "submission_id": 1234567890 }
  ```

#### Submission Status Polling
* **Endpoint Pattern**: `GET https://leetcode.com/submissions/detail/{submission_id}/check/`
* **Response Evaluation**:
  ```json
  {
    "state": "SUCCESS",
    "status_code": 10,
    "status_msg": "Accepted",
    "status_runtime": "42 ms",
    "runtime_percentile": 88.5,
    "status_memory": "17.8 MB",
    "memory_percentile": 74.2,
    "question_id": "1",
    "compare_result": "1111111111"
  }
  ```
  *(Note: `status_code === 10` or `status_msg === "Accepted"` triggers the synchronization pipeline).*

---

### 2.2. LeetCode GraphQL Queries (`content.js`)

* **Endpoints**:
  * Global: `https://leetcode.com/graphql/`
  * China: `https://leetcode.cn/graphql/`

#### Query: `submissionDetails`
Used to fetch 100% full source code, percentiles, and runtime metrics for an accepted submission:
```graphql
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
```

#### Query: `getQuestionDetail`
Fallback used to fetch question HTML content and difficulty if metadata hydration fails:
```graphql
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
```

---

## 3. Chrome Extension Message Passing Protocols

### 3.1. Main World (`inject.js`) &rarr; Isolated World (`content.js`)
* **Transport**: `window.postMessage(message, '*')`

#### Event: `LEETCOMMIT_SUBMISSION_ACCEPTED`
Dispatched when an accepted submission check result is received:
```javascript
{
  source: 'LEETCOMMIT_SUBMISSION_ACCEPTED',
  payload: {
    submissionId: 1234567890,
    titleSlug: 'two-sum',
    lang: 'python3',
    code: 'class Solution:\n    def twoSum(...): ...',
    runtime: '42 ms',
    runtimePercentile: 88.5,
    memory: '17.8 MB',
    memoryPercentile: 74.2,
    metadata: {
      questionId: '1',
      title: 'Two Sum',
      difficulty: 'Easy',
      topicTags: ['Array', 'Hash Table'],
      content: '<p>Given an array...</p>'
    }
  }
}
```

#### Event: `LEETCOMMIT_FULL_CODE_RESPONSE`
Dispatched when Monaco editor models are queried for latest in-memory code:
```javascript
{
  source: 'LEETCOMMIT_FULL_CODE_RESPONSE',
  code: 'class Solution:\n    def twoSum(...): ...',
  timestamp: 1672531199000
}
```

---

### 3.2. Content Script / Popup &rarr; Background Service Worker
* **Transport**: `chrome.runtime.sendMessage(message, callback)`

#### Action: `SYNC_SOLUTION`
Dispatched by `content.js` to trigger GitHub commit execution.
* **Request Schema**:
  ```typescript
  interface SyncSolutionRequest {
    action: 'SYNC_SOLUTION';
    problemData: {
      questionId: string | number;
      titleSlug: string;
      title: string;
      difficulty: 'Easy' | 'Medium' | 'Hard';
      code: string;
      lang: string;
      runtime?: string;
      runtimePercentile?: number;
      memory?: string;
      memoryPercentile?: number;
      markdownDescription: string;
      topicTags: string[];
      url: string;
    };
  }
  ```
* **Response Schema**:
  ```typescript
  interface SyncSolutionResponse {
    success: boolean;
    alreadySynced?: boolean;
    folderPath?: string;
    htmlUrl?: string;
    error?: string;
    codeFile?: {
      sha?: string;
      skipped?: boolean;
    };
  }
  ```

#### Action: `VALIDATE_SETTINGS`
Dispatched by `popup.js` and `welcome.js` to test tokens and repository access.
* **Request Schema**:
  ```typescript
  interface ValidateSettingsRequest {
    action: 'VALIDATE_SETTINGS';
    token: string;
    repo: string; // "owner/repo" or "repo"
  }
  ```
* **Response Schema**:
  ```typescript
  interface ValidateSettingsResponse {
    success: boolean;
    user?: {
      login: string;
      name: string;
      avatarUrl: string;
    };
    repo?: {
      fullName: string;
      defaultBranch: string;
      private: boolean;
      hasPushPermission: boolean;
    };
    error?: string;
  }
  ```

---

## 4. Local Storage Schema (`chrome.storage.local`)

Persistent settings and states are managed via `chrome.storage.local`:

```typescript
interface LeetCommitStorageSchema {
  /** GitHub Fine-Grained Personal Access Token (PAT) */
  github_pat?: string;

  /** Target GitHub repository in format "owner/repo" */
  github_repo?: string;

  /** Target branch for commits (Default: "main") */
  github_branch?: string;

  /** Directory structure mode: 'flat' (0001-two-sum/) or 'difficulty' (Easy/0001-two-sum/) */
  folder_format?: 'flat' | 'difficulty';

  /** Authenticated user profile information */
  user_profile?: {
    login: string;
    name: string;
    avatarUrl: string;
  };

  /** Recent sync activity log (capped at 50 entries) */
  recent_syncs?: Array<{
    id: string;
    questionId: string;
    title: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    lang: string;
    timestamp: number;
    htmlUrl: string;
    status: 'success' | 'already_synced' | 'failed';
    error?: string;
  }>;
}
```
