import React, { useMemo } from 'react';
import { marked } from 'marked';

// Configura marked para habilitar quebras de linha e GitHub Flavored Markdown (tabelas, listas, etc.)
marked.setOptions({
  gfm: true,
  breaks: true
});

export function MarkdownRenderer({ content, className = '' }) {
  const htmlContent = useMemo(() => {
    if (!content) return '';
    try {
      return marked.parse(content);
    } catch (e) {
      console.error('Erro ao renderizar markdown:', e);
      return content;
    }
  }, [content]);

  return (
    <div
      className={`markdown-body text-xs md:text-sm leading-relaxed text-[#2D3748] ${className}`}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
