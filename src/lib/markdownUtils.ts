

declare global {
  interface Window {
    copyCode: (button: HTMLElement) => void;
  }
}

window.copyCode = function (button: HTMLElement): void {
  const codeBlock = button.closest('.code-block-wrapper')?.querySelector('code') as HTMLElement;
  if (!codeBlock) {
    console.error('未找到代码块');
    return;
  }
  
  const code = codeBlock.textContent || '';

  navigator.clipboard.writeText(code).then(() => {
    
    const originalHTML = button.innerHTML;
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20,6 9,17 4,12"></polyline>
      </svg>
    `;
    button.title = '已复制';

    setTimeout(() => {
      button.innerHTML = originalHTML;
      button.title = '复制代码';
    }, 2000);
  }).catch((err: Error) => {
    console.error('复制失败:', err);
    
    const range = document.createRange();
    range.selectNode(codeBlock);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  });
};

function smoothScrollToAnchor(): void {
  document.addEventListener('click', function (e: Event) {
    const target = (e.target as Element)?.closest('a[href^="#"]') as HTMLAnchorElement;
    if (target) {
      e.preventDefault();
      const id = target.getAttribute('href')?.substring(1);
      if (id) {
        const element = document.getElementById(id);
        if (element) {
          element.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
          
          history.pushState(null, '', `#${id}`);
        }
      }
    }
  });
}

function createImageModal(imgSrc: string, imgAlt: string): HTMLElement {
  const modal = document.createElement('div');
  modal.innerHTML = `
    <div class="markdown-content">
      <div class="image-modal">
        <div class="image-modal-backdrop">
          <img src="${imgSrc}" alt="${imgAlt}" class="image-modal-content" />
          <button class="image-modal-close">&times;</button>
        </div>
      </div>
    </div>
  `;
  return modal;
}

function setupModalClose(modal: HTMLElement): void {
  const closeModal = (): void => {
    modal.classList.add('fade-out');
    setTimeout(() => {
      if (modal.parentElement) {
        modal.remove();
      }
    }, 250); 
  };

  
  const backdrop = modal.querySelector('.image-modal-backdrop') as HTMLElement;
  backdrop?.addEventListener('click', (e: Event) => {
    if (e.target === e.currentTarget) {
      closeModal();
    }
  });

  
  const closeButton = modal.querySelector('.image-modal-close') as HTMLElement;
  closeButton?.addEventListener('click', closeModal);

  
  const handleEscape = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  
  document.body.style.overflow = 'hidden';

  
  const originalRemove = modal.remove.bind(modal);
  modal.remove = function (): void {
    document.body.style.overflow = '';
    document.removeEventListener('keydown', handleEscape);
    originalRemove();
  };
}

function setupImageModal(): void {
  const images = document.querySelectorAll('.markdown-image img') as NodeListOf<HTMLImageElement>;
  images.forEach(img => {
    if (img.src.indexOf("/_image?href=") !== -1) {
      return;
    }
    
    img.src = transformImageUrl(img.src);
    
    
    img.addEventListener('click', function (this: HTMLImageElement) {
      const modal = createImageModal(this.src, this.alt || '');
      setupModalClose(modal);
      document.body.appendChild(modal);
    });
  });
}

function transformImageUrl(url: string): string {
  return `/_image?href=${encodeURIComponent(url)}`;
}

function initMarkdownUtils(): void {
  smoothScrollToAnchor();
  setupImageModal();
}

document.addEventListener('DOMContentLoaded', initMarkdownUtils);

export {
  smoothScrollToAnchor,
  setupImageModal,
  transformImageUrl,
  initMarkdownUtils
};
