"use client";

import { useEffect } from "react";

interface TagInjectorProps {
  /** Target = document.head or document.body. */
  target: "head" | "body";
  /** Raw HTML string stored in a tag_template.content. */
  html: string;
}

/**
 * Inject raw HTML (Google Tag Manager snippets etc.) into document.head or
 * document.body on mount. Uses Range.createContextualFragment so that
 * inline <script> tags are actually executed by the browser — a plain
 * innerHTML assignment would inert them.
 *
 * The injected fragment is tagged with data-yoberu-tag so that:
 *  - repeated client renders of the same page don't duplicate the tags
 *  - on unmount (navigation) we can remove the fragment to keep things clean
 */
export function TagInjector({ target, html }: TagInjectorProps) {
  useEffect(() => {
    if (!html || typeof document === "undefined") return;
    const root = target === "head" ? document.head : document.body;
    const marker = `yoberu-tag-${target}`;

    // Avoid double-injection if React re-mounts this component.
    if (root.querySelector(`[data-yoberu-tag="${marker}"]`)) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(root);
    const fragment = range.createContextualFragment(html);

    // Tag every top-level element so we can find & remove them later.
    const injected: Node[] = [];
    fragment.childNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        (node as Element).setAttribute("data-yoberu-tag", marker);
      }
      injected.push(node);
    });

    if (target === "head") {
      root.appendChild(fragment);
    } else {
      // body は先頭に挿入する (GTM の <noscript><iframe> が body 直下に来る
      // のが Google の推奨)。
      root.insertBefore(fragment, root.firstChild);
    }

    return () => {
      injected.forEach((n) => {
        if (n.parentNode) n.parentNode.removeChild(n);
      });
    };
  }, [target, html]);

  return null;
}
