// popup.js - Dark Mode Popup Controller

document.addEventListener('DOMContentLoaded', () => {
  const siteDot = document.getElementById('siteDot');
  const siteDomain = document.getElementById('siteDomain');
  const siteSubtitle = document.getElementById('siteSubtitle');
  const siteToggleBtn = document.getElementById('siteToggleBtn');
  const autofillPageBtn = document.getElementById('autofillPageBtn');
  const openProfileBtn = document.getElementById('openProfileBtn');
  const openAddressesBtn = document.getElementById('openAddressesBtn');
  const entriesCount = document.getElementById('entriesCount');
  const entriesCountLink = document.getElementById('entriesCountLink');
  const openSettingsTopBtn = document.getElementById('openSettingsTopBtn');
  const openOptionsLink = document.getElementById('openOptionsLink');
  const openTestSandboxLink = document.getElementById('openTestSandboxLink');

  let currentSettings = {};
  let currentTab = null;
  let currentDomain = '';

  // Get active tab details
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0]) {
      currentTab = tabs[0];
      try {
        const u = new URL(currentTab.url);
        if (u.protocol.startsWith('http')) {
          currentDomain = u.hostname.toLowerCase();
        } else {
          currentDomain = u.protocol.replace(':', '');
        }
      } catch (_) {
        currentDomain = 'Current Page';
      }
      if (siteDomain) siteDomain.textContent = currentDomain;
      updateDomainUI();
    }
  });

  function updateDomainUI() {
    if (!siteDot || !siteToggleBtn || !currentDomain) return;
    const disabledList = Array.isArray(currentSettings.disabledDomains) ? currentSettings.disabledDomains : [];
    const isPaused = disabledList.some(d => currentDomain === d || currentDomain.endsWith('.' + d));

    if (isPaused) {
      siteDot.classList.add('is-paused');
      siteToggleBtn.classList.add('is-paused');
      siteToggleBtn.textContent = 'Paused';
      siteToggleBtn.title = 'Click to re-enable on ' + currentDomain;
      if (siteSubtitle) siteSubtitle.textContent = 'Paused on this site';
    } else {
      siteDot.classList.remove('is-paused');
      siteToggleBtn.classList.remove('is-paused');
      siteToggleBtn.textContent = 'Active';
      siteToggleBtn.title = 'Click to pause on ' + currentDomain;
      if (siteSubtitle) siteSubtitle.textContent = 'Active on this site';
    }
  }

  function toggleDomainState() {
    if (!currentDomain || currentDomain.includes('chrome')) return;
    chrome.runtime.sendMessage({ type: 'TOGGLE_DOMAIN_PAUSE', domain: currentDomain }, (res) => {
      if (res && res.success) {
        currentSettings.disabledDomains = res.disabledDomains;
        updateDomainUI();
      }
    });
  }

  if (siteToggleBtn) {
    siteToggleBtn.addEventListener('click', toggleDomainState);
  }

  function loadData() {
    chrome.runtime.sendMessage({ type: 'GET_ALL_ENTRIES' }, (res) => {
      if (chrome.runtime.lastError || !res) return;
      const allEntries = res.entries || [];
      currentSettings = res.settings || {};

      if (entriesCount) {
        const count = allEntries.length;
        entriesCount.textContent = `${count} saved item${count === 1 ? '' : 's'}`;
      }
      updateDomainUI();
    });
  }

  // AutoFill Current Page
  if (autofillPageBtn) {
    autofillPageBtn.addEventListener('click', async () => {
      const originalHtml = autofillPageBtn.innerHTML;
      autofillPageBtn.innerHTML = '<span>⏳</span> AutoFilling...';
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_AUTOFILL', force: true }, () => {
            if (chrome.runtime.lastError) {
              autofillPageBtn.innerHTML = '<span>⚠️</span> Cannot fill this page';
            } else {
              autofillPageBtn.innerHTML = '<span>✅</span> Page AutoFilled!';
            }
            setTimeout(() => {
              autofillPageBtn.innerHTML = originalHtml;
            }, 1800);
          });
        } else {
          autofillPageBtn.innerHTML = originalHtml;
        }
      } catch (_) {
        autofillPageBtn.innerHTML = '<span>⚠️</span> Error';
        setTimeout(() => {
          autofillPageBtn.innerHTML = originalHtml;
        }, 1800);
      }
    });
  }

  // Quick navigation handlers
  if (openProfileBtn) {
    openProfileBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html#profileTab') });
    });
  }

  if (openAddressesBtn) {
    openAddressesBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html#addressesTab') });
    });
  }

  if (entriesCountLink) {
    entriesCountLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html#managerTab') });
    });
  }

  const openSettings = (e) => {
    if (e) e.preventDefault();
    chrome.runtime.openOptionsPage();
  };

  if (openSettingsTopBtn) openSettingsTopBtn.addEventListener('click', openSettings);
  if (openOptionsLink) openOptionsLink.addEventListener('click', openSettings);

  if (openTestSandboxLink) {
    openTestSandboxLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://xconflictionx.cc/tools/auto-complete/' });
    });
  }

  loadData();
});
