import { Virtualizer, elementScroll, observeElementRect, observeElementOffset } from "https://esm.sh/@tanstack/virtual-core@3";

// Remove DOMContentLoaded listener because type="module" executes after HTML parsing is complete.
// --- State & DOM References ---
const dbElement = document.getElementById('glossary-db');
let glossary = [];
try {
  glossary = JSON.parse(dbElement.textContent.trim());
} catch (e) {
  console.error('Failed to parse glossary JSON database:', e);
}

// DOM Elements
const searchInput = document.getElementById('search-input');
const termsList = document.getElementById('terms-list');
const categoryBadges = document.querySelectorAll('.category-badge');
const complexityBadges = document.querySelectorAll('.complexity-badge');
const detailPane = document.getElementById('detail-pane');
const detailScrollContainer = document.getElementById('detail-scroll-container');
const virtualListInner = document.getElementById('virtual-list-inner');
const mobileBackBtn = document.getElementById('mobile-back-btn');

// Stats
const statCount = document.getElementById('stat-count');
const statCategories = document.getElementById('stat-categories');

// Theme Toggle
const themeToggle = document.getElementById('theme-toggle');

// Commander Modal Elements
const commanderModal = document.getElementById('commander-modal');
const commanderInput = document.getElementById('commander-input');
const commanderResults = document.getElementById('commander-results');

// Toast Alert
const toast = document.getElementById('toast');

let activeCategory = 'all';
let activeComplexity = 'all';
let searchQuery = '';
let activeTermIndex = -1;
let firstVisibleIndex = -1;
let isScrollingProgrammatically = false;
let virtualizer = null;

// Custom ResizeObserver to bypass TanStack Vanilla JS onChange bugs on Safari
// This forces the UI to update immediately when items are measured to their true sizes.
const itemResizeObserver = new ResizeObserver(() => {
  if (virtualizer) {
    // Only re-render if the size cache actually changed? 
    // Just wrap in rAF to prevent loop.
    requestAnimationFrame(() => {
      if (virtualizer) renderVirtualItems(virtualizer);
    });
  }
});

function customElementScroll(offset, canAnimate, instance) {
  console.log("customElementScroll called with offset:", offset);
  if (detailScrollContainer) {
    detailScrollContainer.scrollTo({ top: offset, behavior: canAnimate ? 'smooth' : 'auto' });
  }
}

// --- Virtual List Setup ---
let visibleIndices = Array.from({ length: glossary.length }, (_, i) => i);
let renderedNodes = {};

function initVirtualizer() {
  const rect = detailScrollContainer.getBoundingClientRect();
  virtualizer = new Virtualizer({
    count: visibleIndices.length,
    getScrollElement: () => detailScrollContainer,
    estimateSize: () => 150,
    overscan: 5,
    initialRect: { width: rect.width || 800, height: rect.height || 600 },
    scrollToFn: customElementScroll,
    observeElementRect: observeElementRect,
    observeElementOffset: observeElementOffset,
    onChange: (instance) => {
      renderVirtualItems(instance);
      updateScrollspy(instance);
    }
  });

  // In Vanilla JS, we MUST call the internal _didMount to attach the observers!
  virtualizer._didMount();

  // Workaround for TanStack Virtual Core v3 Vanilla JS bug where onChange does not fire on scroll:
  detailScrollContainer.addEventListener('scroll', () => {
    if (virtualizer) {
      // Manually update internal state and force render
      virtualizer.scrollOffset = detailScrollContainer.scrollTop;
      renderVirtualItems(virtualizer);
      updateScrollspy(virtualizer);
    }
  }, { passive: true });

  // Force an initial render manually since no scroll event has fired
  renderVirtualItems(virtualizer);
}

  function updateScrollspy(instance) {
    if (isScrollingProgrammatically) return;
    const items = instance.getVirtualItems();
    if (items.length > 0) {
      // Find the first visible item that takes up a meaningful part of the view
      const firstVisible = items[0];
      const actualIndex = visibleIndices[firstVisible.index];
      if (actualIndex !== undefined && actualIndex !== activeTermIndex) {
        highlightActiveCard(actualIndex);
      }
    }
  }

  function renderVirtualItems(instance) {
    if (!virtualListInner) return;
    
    // Set total scroll height
    virtualListInner.style.height = `${instance.getTotalSize()}px`;

    const items = instance.getVirtualItems();
    console.log('Virtual items count:', items.length, 'Total size:', instance.getTotalSize(), 'Container height:', detailScrollContainer.getBoundingClientRect().height);
    const currentItemIndices = new Set(items.map(i => i.index));

    // Cleanup old nodes
    for (const vIndex in renderedNodes) {
      if (!currentItemIndices.has(parseInt(vIndex, 10))) {
        renderedNodes[vIndex].remove();
        delete renderedNodes[vIndex];
      }
    }

    // Render new nodes or update positions
    items.forEach(virtualItem => {
      const vIndex = virtualItem.index;
      const actualIndex = visibleIndices[vIndex];
      const itemData = glossary[actualIndex];
      
      let node = renderedNodes[vIndex];
      const currentDataId = node ? parseInt(node.getAttribute('data-id'), 10) : -1;
      
      // If node doesn't exist, or it's representing a different actual item now (due to search)
      if (!node || currentDataId !== actualIndex) {
        if (node) {
          node.remove();
          itemResizeObserver.unobserve(node);
        }
        node = document.createElement('div');
        node.className = 'detail-block active';
        node.setAttribute('data-id', actualIndex);
        node.setAttribute('data-index', vIndex);
        node.innerHTML = generateDetailHtml(itemData, actualIndex);
        virtualListInner.appendChild(node);
        renderedNodes[vIndex] = node;
        
        // Tell the virtualizer the actual height of this node
        instance.measureElement(node);
        
        // Tell our custom observer to watch this node for height changes
        itemResizeObserver.observe(node);
      }
      
      // Position it exactly where TanStack says it belongs
      node.style.position = 'absolute';
      node.style.top = 0;
      node.style.left = 0;
      node.style.right = 0;
      node.style.margin = '0 auto';
      node.style.width = '100%';
      node.style.transform = `translateY(${virtualItem.start}px)`;

      // Tell the virtualizer the actual height of this node (crucial for dynamic heights!)
      instance.measureElement(node);
      
      // Tell our custom observer to watch this node for height changes
      itemResizeObserver.observe(node);
    });
  }

  // --- Initial Setup ---
  updateStats();
  initTheme();
  initVirtualizer();
  setupURLRoute();

  // --- Fuzzy Match Helper ---
  function fuzzyMatch(query, target) {
    if (!query) return true;
    query = query.toLowerCase().replace(/\s+/g, '');
    target = target.toLowerCase();
    let queryIdx = 0;
    for (let targetIdx = 0; targetIdx < target.length; targetIdx++) {
      if (target[targetIdx] === query[queryIdx]) {
        queryIdx++;
        if (queryIdx === query.length) {
          return true;
        }
      }
    }
    return false;
  }

  // --- Search & Filter Logic ---
  function updateListVisibility() {
    const cards = termsList.querySelectorAll('.glossary-card');
    visibleIndices = [];
    let firstVisibleIndex = -1;

    glossary.forEach((item, idx) => {
      const card = cards[idx];
      if (!card) return;

      const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
      const itemComplexity = item.complexity; // Since block doesn't exist statically anymore
      const matchesComplexity = activeComplexity === 'all' || itemComplexity === activeComplexity;
      
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = !query || 
        item.hebrewTerm.toLowerCase().includes(query) ||
        item.englishTerm.toLowerCase().includes(query) ||
        item.transliteration.toLowerCase().includes(query) ||
        item.englishDefinition.toLowerCase().includes(query) ||
        fuzzyMatch(query, item.hebrewTerm) ||
        fuzzyMatch(query, item.englishTerm) ||
        fuzzyMatch(query, item.transliteration);

      if (matchesCategory && matchesComplexity && matchesSearch) {
        card.classList.remove('hidden');
        visibleIndices.push(idx);
        if (firstVisibleIndex === -1) {
          firstVisibleIndex = idx;
        }
      } else {
        card.classList.add('hidden');
      }
    });

    statCount.textContent = visibleIndices.length;

    // Update Virtualizer options to new filtered count
    if (virtualizer) {
      const rect = detailScrollContainer.getBoundingClientRect();
      virtualizer.setOptions({
        count: visibleIndices.length,
        getScrollElement: () => detailScrollContainer,
        estimateSize: () => 150,
        overscan: 5,
        initialRect: { width: rect.width || 800, height: rect.height || 600 },
        scrollToFn: customElementScroll,
        observeElementRect: observeElementRect,
        observeElementOffset: observeElementOffset,
        onChange: (instance) => {
          renderVirtualItems(instance);
          updateScrollspy(instance);
        }
      });
      // Clear TanStack's size cache because index 0 is now a completely different item
      virtualizer.measure();
      // Force render since options changed
      renderVirtualItems(virtualizer);
    }

    // Automatically navigate to the first visible term on search input
    if (firstVisibleIndex !== -1 && searchQuery !== '') {
      selectTerm(firstVisibleIndex);
    }
  }

  // Helper to escape HTML to prevent XSS
  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getComplexityLabel(comp) {
    if (comp === 'Low') return 'קל';
    if (comp === 'High') return 'מורכב';
    return 'בינוני';
  }

  function generateDetailHtml(item, index) {
    return `
      <div class="detail-header-section">
        <div class="detail-meta">
          <div class="detail-tags">
            <span class="detail-category-tag">${escapeHTML(item.category)}</span>
            <span class="detail-origin-tag ${item.isNative ? 'tag-native' : 'tag-heblish'}">${item.isNative ? 'Native' : 'Heblish'}</span>
            <span class="detail-complexity-tag tag-${item.complexity.toLowerCase()}">${getComplexityLabel(item.complexity)}</span>
          </div>
          <button class="action-btn share-permalink-btn" data-term="${escapeHTML(item.englishTerm)}" title="Copy shareable link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
            <span>העתק קישור</span>
          </button>
        </div>
        
        <div class="active-term-group" dir="ltr">
          <h2 class="active-term-title">
            <span class="active-term-he" dir="rtl">${escapeHTML(item.hebrewTerm)}</span>
            <span class="active-term-en">${escapeHTML(item.englishTerm)}</span>
          </h2>
          <p class="active-term-definition">${escapeHTML(item.englishDefinition)}</p>
        </div>
      </div>

      <div class="detail-body-section">
        ${item.hebrewExample ? `
          <div class="section-block">
            <h4 class="section-title">USAGE EXAMPLE // דוגמת שימוש</h4>
            <div class="context-usage">
              <p class="example-he" dir="rtl">"${escapeHTML(item.hebrewExample)}"</p>
              ${item.transliteration ? `<p class="example-translit" dir="ltr">${escapeHTML(item.transliteration)}</p>` : ''}
              ${item.englishExampleTranslation ? `<p class="example-en" dir="ltr">"${escapeHTML(item.englishExampleTranslation)}"</p>` : ''}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  function highlightActiveCard(index) {
    activeTermIndex = index;
    const cards = termsList.querySelectorAll('.glossary-card');
    cards.forEach(c => {
      const cid = parseInt(c.getAttribute('data-id'), 10);
      if (cid === index) {
        c.classList.add('selected');
        // Ensure card is visible in the sidebar list when navigating
        c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        c.classList.remove('selected');
      }
    });
    
    const item = glossary[index];
    if (item) {
      const url = new URL(window.location);
      url.searchParams.set('term', item.englishTerm);
      window.history.replaceState({}, '', url);
    }
  }

  function selectTerm(index, triggerVirtualScroll = true) {
    console.log("selectTerm called with index:", index, triggerVirtualScroll);
    if (index < 0 || index >= glossary.length) return;
    
    const card = termsList.querySelector(`.glossary-card[data-id="${index}"]`);
    if (!card || card.classList.contains('hidden')) return;

    highlightActiveCard(index);

    if (triggerVirtualScroll && virtualizer) {
      const vIndex = visibleIndices.indexOf(index);
      if (vIndex !== -1) {
        isScrollingProgrammatically = true;
        
        try {
          const offset = virtualizer.getOffsetForIndex(vIndex, 'start');
          const topOffset = Array.isArray(offset) ? offset[0] : offset;
          detailScrollContainer.scrollTo({ top: topOffset, behavior: 'smooth' });
        } catch (err) {
          console.error("selectTerm error:", err);
        }
        
        setTimeout(() => {
          isScrollingProgrammatically = false;
        }, 700);
      }
    }

    // Slide in details pane on mobile
    detailPane.classList.add('mobile-active');
  }

  function updateStats() {
    statCount.textContent = glossary.length;
    const categories = new Set(glossary.map(item => item.category));
    statCategories.textContent = categories.size;
  }

  // --- Theme Controller ---
  function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      document.body.classList.remove('dark-mode');
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
      document.body.classList.add('dark-mode');
    }
  }

  themeToggle.addEventListener('click', () => {
    if (document.body.classList.contains('dark-mode')) {
      document.body.classList.remove('dark-mode');
      document.body.classList.add('light-mode');
      localStorage.setItem('theme', 'light');
    } else {
      document.body.classList.remove('light-mode');
      document.body.classList.add('dark-mode');
      localStorage.setItem('theme', 'dark');
    }
  });

  // --- Suggest Edit Button (Obfuscated) ---
  const suggestBtn = document.getElementById('suggest-btn');
  if (suggestBtn) {
    suggestBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const u = 'dvid.levy+milontech';
      const d = 'gmail.com';
      window.location.href = `mailto:${u}@${d}?subject=milon.tech%20Suggestion`;
    });
  }

  // --- Keyboard & Arrow Key Navigation ---
  function navigateToNextTerm() {
    if (visibleIndices.length === 0) return;
    
    let nextIdx = visibleIndices[0];
    const currentPos = visibleIndices.indexOf(activeTermIndex);
    if (currentPos !== -1 && currentPos + 1 < visibleIndices.length) {
      nextIdx = visibleIndices[currentPos + 1];
    }
    selectTerm(nextIdx, true);
  }

  function navigateToPrevTerm() {
    if (visibleIndices.length === 0) return;
    
    let prevIdx = visibleIndices[visibleIndices.length - 1];
    const currentPos = visibleIndices.indexOf(activeTermIndex);
    if (currentPos > 0) {
      prevIdx = visibleIndices[currentPos - 1];
    }
    selectTerm(prevIdx, true);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeCommander();
      return;
    }
    
    if ((e.key === '/' && document.activeElement !== searchInput && document.activeElement !== commanderInput) || 
        (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      openCommander();
      return;
    }

    if (commanderModal.classList.contains('hidden') && document.activeElement !== searchInput) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        navigateToNextTerm();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateToPrevTerm();
      }
    }
  });

  // --- Mobile Swipe to Change Category ---
  let touchStartX = 0;
  let touchEndX = 0;

  document.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  document.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  }, { passive: true });

  function handleSwipe() {
    if (window.innerWidth > 860 || detailPane.classList.contains('mobile-active')) return;

    const threshold = 60; 
    const diffX = touchEndX - touchStartX;

    if (Math.abs(diffX) < threshold) return;

    const badges = Array.from(categoryBadges);
    const currentIndex = badges.findIndex(b => b.classList.contains('active'));
    
    if (currentIndex === -1) return;

    if (diffX > 0) {
      if (currentIndex < badges.length - 1) {
        badges[currentIndex + 1].click();
        badges[currentIndex + 1].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    } else {
      if (currentIndex > 0) {
        badges[currentIndex - 1].click();
        badges[currentIndex - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }

  // --- Event Listeners ---

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    updateListVisibility();
  });

  categoryBadges.forEach(badge => {
    badge.addEventListener('click', () => {
      categoryBadges.forEach(b => b.classList.remove('active'));
      badge.classList.add('active');
      activeCategory = badge.getAttribute('data-category');
      updateListVisibility();
    });
  });

  if (complexityBadges) {
    complexityBadges.forEach(badge => {
      badge.addEventListener('click', () => {
        complexityBadges.forEach(b => b.classList.remove('active'));
        badge.classList.add('active');
        activeComplexity = badge.getAttribute('data-complexity');
        updateListVisibility();
      });
    });
  }

  termsList.addEventListener('click', (e) => {
    const card = e.target.closest('.glossary-card');
    if (!card) return;
    const idx = parseInt(card.getAttribute('data-id'), 10);
    selectTerm(idx, true);
  });

  mobileBackBtn.addEventListener('click', () => {
    detailPane.classList.remove('mobile-active');
  });

  // Delegated Copy Permalink
  detailScrollContainer.addEventListener('click', (e) => {
    const shareBtn = e.target.closest('.share-permalink-btn');
    if (!shareBtn) return;

    const term = shareBtn.getAttribute('data-term');
    const url = new URL(window.location);
    url.searchParams.set('term', term);
    
    navigator.clipboard.writeText(url.toString()).then(() => {
      toast.classList.remove('hidden');
      setTimeout(() => {
        toast.classList.add('hidden');
      }, 2000);
    }).catch(err => {
      console.error('Could not copy link:', err);
    });
  });

  // --- Commander Modal Palette ---
  function openCommander() {
    commanderModal.classList.remove('hidden');
    commanderInput.value = '';
    commanderInput.focus();
    renderCommanderResults('');
  }

  function closeCommander() {
    commanderModal.classList.add('hidden');
  }

  commanderInput.addEventListener('input', (e) => {
    renderCommanderResults(e.target.value);
  });

  commanderModal.addEventListener('click', (e) => {
    if (e.target === commanderModal) {
      closeCommander();
    }
  });

  function renderCommanderResults(query) {
    const cleanQuery = query.toLowerCase().trim();
    commanderResults.innerHTML = '';

    const matches = glossary
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        if (!cleanQuery) return true;
        return item.hebrewTerm.toLowerCase().includes(cleanQuery) ||
               item.englishTerm.toLowerCase().includes(cleanQuery) ||
               fuzzyMatch(cleanQuery, item.hebrewTerm) ||
               fuzzyMatch(cleanQuery, item.englishTerm);
      })
      .slice(0, 8);

    if (matches.length === 0) {
      commanderResults.innerHTML = `<div class="commander-item" style="pointer-events: none;"><span class="text-dim">אין מונחים תואמים...</span></div>`;
      return;
    }

    matches.forEach(({ item, index }, i) => {
      const itemEl = document.createElement('div');
      itemEl.className = `commander-item ${i === 0 ? 'active' : ''}`;
      itemEl.setAttribute('data-index', index);
      
      itemEl.innerHTML = `
        <div class="commander-item-header">
          <div class="commander-item-title">
            <span class="commander-item-he" dir="rtl">${item.hebrewTerm}</span>
            <span class="commander-item-sep">/</span>
            <span class="commander-item-en" dir="ltr">${item.englishTerm}</span>
          </div>
          <span class="commander-item-cat">${item.category}</span>
        </div>
        <div class="commander-item-def" dir="ltr">${item.englishDefinition}</div>
      `;

      itemEl.addEventListener('click', () => {
        selectTerm(index, true);
        closeCommander();
      });

      commanderResults.appendChild(itemEl);
    });

    let activeIdx = 0;
    const items = commanderResults.querySelectorAll('.commander-item');

    const handleModalKeys = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[activeIdx]?.classList.remove('active');
        activeIdx = (activeIdx + 1) % items.length;
        items[activeIdx]?.classList.add('active');
        items[activeIdx]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[activeIdx]?.classList.remove('active');
        activeIdx = (activeIdx - 1 + items.length) % items.length;
        items[activeIdx]?.classList.add('active');
        items[activeIdx]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const activeItem = items[activeIdx];
        if (activeItem) {
          const idx = parseInt(activeItem.getAttribute('data-index'), 10);
          selectTerm(idx, true);
          closeCommander();
          commanderInput.removeEventListener('keydown', handleModalKeys);
        }
      }
    };

    commanderInput.removeEventListener('keydown', handleModalKeys);
    commanderInput.addEventListener('keydown', handleModalKeys);
  }

  // --- URL Route Parsing ---
  function setupURLRoute() {
    const urlParams = new URLSearchParams(window.location.search);
    const termQuery = urlParams.get('term');
    
    if (termQuery) {
      const index = glossary.findIndex(item => item.englishTerm.toLowerCase() === termQuery.toLowerCase());
      if (index !== -1) {
        setTimeout(() => selectTerm(index, true), 100);
        return;
      }
    }
    
    // Default select first item
    if (glossary.length > 0) {
      selectTerm(0, false); 
    }
  }
