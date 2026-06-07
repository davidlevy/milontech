document.addEventListener('DOMContentLoaded', () => {
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
  const detailPane = document.getElementById('detail-pane');
  const detailScrollContainer = document.getElementById('detail-scroll-container');
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
  let searchQuery = '';
  let activeTermIndex = -1;
  let isScrollingProgrammatically = false;

  // --- Initial Setup ---
  updateStats();
  initTheme();
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
    const blocks = detailScrollContainer.querySelectorAll('.detail-block');
    let visibleCount = 0;
    let firstVisibleIndex = -1;

    glossary.forEach((item, idx) => {
      const card = cards[idx];
      const block = blocks[idx];
      if (!card || !block) return;

      const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
      
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = !query || 
        item.hebrewTerm.toLowerCase().includes(query) ||
        item.englishTerm.toLowerCase().includes(query) ||
        item.transliteration.toLowerCase().includes(query) ||
        item.englishDefinition.toLowerCase().includes(query) ||
        fuzzyMatch(query, item.hebrewTerm) ||
        fuzzyMatch(query, item.englishTerm) ||
        fuzzyMatch(query, item.transliteration);

      if (matchesCategory && matchesSearch) {
        card.classList.remove('hidden');
        block.classList.remove('hidden');
        if (firstVisibleIndex === -1) {
          firstVisibleIndex = idx;
        }
        visibleCount++;
      } else {
        card.classList.add('hidden');
        block.classList.add('hidden');
      }
    });

    // Update active count stat
    statCount.textContent = visibleCount;

    // Automatically navigate to the first visible term on search input
    if (firstVisibleIndex !== -1 && searchQuery !== '') {
      selectTerm(firstVisibleIndex, true);
    }
  }

  function selectTerm(index, triggerScroll = true) {
    if (index < 0 || index >= glossary.length) return;
    
    // Guard against selecting hidden elements
    const block = document.getElementById(`detail-term-${index}`);
    if (!block || block.classList.contains('hidden')) return;

    activeTermIndex = index;

    // Highlight active card in explorer sidebar
    const cards = termsList.querySelectorAll('.glossary-card');
    cards.forEach(card => {
      const cid = parseInt(card.getAttribute('data-id'), 10);
      if (cid === index) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });

    // Highlight active block in details pane
    const blocks = detailScrollContainer.querySelectorAll('.detail-block');
    blocks.forEach(b => {
      const bid = parseInt(b.getAttribute('data-id'), 10);
      if (bid === index) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    // Smoothly scroll the selected block to top of container
    if (triggerScroll && block) {
      isScrollingProgrammatically = true;
      block.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Reset flag after transition finishes
      setTimeout(() => {
        isScrollingProgrammatically = false;
      }, 700);
    }

    // Slide in details pane on mobile
    detailPane.classList.add('mobile-active');

    // Update URL parameters
    const item = glossary[index];
    if (item) {
      const url = new URL(window.location);
      url.searchParams.set('term', item.englishTerm);
      window.history.replaceState({}, '', url);
    }
  }

  // --- Scrollspy Handler ---
  detailScrollContainer.addEventListener('scroll', () => {
    // Avoid double updates during a programmatic scroll click
    if (isScrollingProgrammatically) return;

    const blocks = detailScrollContainer.querySelectorAll('.detail-block:not(.hidden)');
    let activeBlock = null;
    let minDiff = Infinity;
    
    const containerTop = detailScrollContainer.getBoundingClientRect().top;

    blocks.forEach(block => {
      const rect = block.getBoundingClientRect();
      // Calculate how close the top of this block is to the top margin of the container
      const diff = Math.abs(rect.top - containerTop);
      // Give a tiny offset tolerance (150px) to highlight whichever term is currently active
      if (diff < minDiff && rect.top - containerTop < 150) {
        minDiff = diff;
        activeBlock = block;
      }
    });

    if (activeBlock) {
      const idx = parseInt(activeBlock.getAttribute('data-id'), 10);
      if (idx !== activeTermIndex) {
        selectTerm(idx, false);
      }
    }
  });

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

  // --- Keyboard & Arrow Key Navigation ---
  function getVisibleIndices() {
    const visible = [];
    const blocks = detailScrollContainer.querySelectorAll('.detail-block');
    blocks.forEach(block => {
      if (!block.classList.contains('hidden')) {
        visible.push(parseInt(block.getAttribute('data-id'), 10));
      }
    });
    return visible;
  }

  function navigateToNextTerm() {
    const visible = getVisibleIndices();
    if (visible.length === 0) return;
    
    let nextIdx = visible[0];
    const currentPos = visible.indexOf(activeTermIndex);
    if (currentPos !== -1 && currentPos + 1 < visible.length) {
      nextIdx = visible[currentPos + 1];
    }
    selectTerm(nextIdx, true);
  }

  function navigateToPrevTerm() {
    const visible = getVisibleIndices();
    if (visible.length === 0) return;
    
    let prevIdx = visible[visible.length - 1];
    const currentPos = visible.indexOf(activeTermIndex);
    if (currentPos !== -1 && currentPos - 1 >= 0) {
      prevIdx = visible[currentPos - 1];
    }
    selectTerm(prevIdx, true);
  }

  window.addEventListener('keydown', (e) => {
    // Escape closes modal
    if (e.key === 'Escape') {
      closeCommander();
      return;
    }
    
    // '/' or 'Cmd+K' to search / open commander
    if ((e.key === '/' && document.activeElement !== searchInput && document.activeElement !== commanderInput) || 
        (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      openCommander();
      return;
    }

    // Arrow navigation
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

  // --- Event Listeners ---

  // Search input change
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    updateListVisibility();
  });

  // Category Badge Click
  categoryBadges.forEach(badge => {
    badge.addEventListener('click', () => {
      categoryBadges.forEach(b => b.classList.remove('active'));
      badge.classList.add('active');
      activeCategory = badge.getAttribute('data-category');
      updateListVisibility();
    });
  });

  // Sidebar Explorer Cards Click
  termsList.addEventListener('click', (e) => {
    const card = e.target.closest('.glossary-card');
    if (!card) return;
    const idx = parseInt(card.getAttribute('data-id'), 10);
    selectTerm(idx, true);
  });

  // Mobile Back Button
  mobileBackBtn.addEventListener('click', () => {
    detailPane.classList.remove('mobile-active');
  });

  // Copy Permalink functionality (Delegated for dynamically lists)
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
        selectTerm(index, true);
        return;
      }
    }
    
    // Default select first item
    if (glossary.length > 0) {
      selectTerm(0, false); // highlight but don't force smooth scroll on load
    }
  }
});
