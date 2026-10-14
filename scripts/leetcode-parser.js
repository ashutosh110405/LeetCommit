/**
 * LeetCode HTML to Markdown Converter & DOM Parser
 * Converts problem descriptions into clean, readable GitHub Markdown.
 */

(function () {
  'use strict';

  function decodeEntities(str) {
    if (!str) return '';
    const element = document.createElement('div');
    element.innerHTML = str;
    return element.textContent || element.innerText || '';
  }

  function htmlToMarkdown(html) {
    if (!html) return '';

    // Create a temporary DOM container to parse cleanly
    const container = document.createElement('div');
    container.innerHTML = html;

    // Process recursively
    function processNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }

      const tagName = node.tagName.toLowerCase();
      let childrenText = '';

      for (let i = 0; i < node.childNodes.length; i++) {
        childrenText += processNode(node.childNodes[i]);
      }

      switch (tagName) {
        case 'p':
          return `\n\n${childrenText.trim()}\n\n`;

        case 'strong':
        case 'b':
          return `**${childrenText.trim()}**`;

        case 'em':
        case 'i':
          return `*${childrenText.trim()}*`;

        case 'code':
          // If parent is PRE, don't wrap inline backticks
          if (node.parentNode && node.parentNode.tagName.toLowerCase() === 'pre') {
            return childrenText;
          }
          return `\`${childrenText}\``;

        case 'pre':
          return `\n\n\`\`\`\n${childrenText.trim()}\n\`\`\`\n\n`;

        case 'ul':
          return `\n\n${childrenText.trim()}\n\n`;

        case 'ol':
          return `\n\n${childrenText.trim()}\n\n`;

        case 'li':
          return `\n- ${childrenText.trim()}`;

        case 'h1':
          return `\n\n# ${childrenText.trim()}\n\n`;
        case 'h2':
          return `\n\n## ${childrenText.trim()}\n\n`;
        case 'h3':
          return `\n\n### ${childrenText.trim()}\n\n`;
        case 'h4':
          return `\n\n#### ${childrenText.trim()}\n\n`;

        case 'sup':
          return `^${childrenText}`;

        case 'sub':
          return `_${childrenText}`;

        case 'br':
          return '\n';

        case 'hr':
          return '\n\n---\n\n';

        case 'img': {
          const src = node.getAttribute('src') || '';
          const alt = node.getAttribute('alt') || 'image';
          return `\n\n![${alt}](${src})\n\n`;
        }

        case 'a': {
          const href = node.getAttribute('href') || '#';
          return `[${childrenText.trim()}](${href})`;
        }

        default:
          return childrenText;
      }
    }

    let markdown = processNode(container);

    // Clean up excessive blank lines
    markdown = markdown
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+|\s+$/g, '');

    return markdown;
  }

  // Export to window for content script usage
  window.LeetCodeParser = {
    htmlToMarkdown,
    decodeEntities
  };
})();

