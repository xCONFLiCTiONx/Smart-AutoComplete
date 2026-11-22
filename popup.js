// popup.js - Dark Mode Popup Controller

document.addEventListener('DOMContentLoaded', () => {
  const siteDot = document.getElementById('siteDot');
  const siteDomain = document.getElementById('siteDomain');
  const siteSubtitle = document.getElementById('siteSubtitle');
  const siteStatusPill = document.getElementById('siteStatusPill');
  const excludeSiteBtn = document.getElementById('excludeSiteBtn');
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
  let isSupportedSite = false;

  // Get active tab details
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0]) {
      currentTab = tabs[0];
      try {
        const u = new URL(currentTab.url || '');
        const host = u.hostname.toLowerCase();
        const isWebProtocol = u.protocol === 'http:' || u.protocol === 'https:';
        const isWebStore = host === 'chromewebstore.google.com' || host === 'chrome.google.com';
        if (isWebProtocol && host && !isWebStore) {
          currentDomain = host;
          isSupportedSite = true;
        } else {
          currentDomain = host || u.protocol.replace(':', '') || 'Current Page';
          isSupportedSite = false;
        }
      } catch (_) {
        currentDomain = 'Current Page';
        isSupportedSite = false;
      }
      if (siteDomain) siteDomain.textContent = currentDomain;
      updateDomainUI();
    }
  });

  function updateDomainUI() {
    if (!siteDot || !excludeSiteBtn || !currentDomain) return;

    if (!isSupportedSite) {
      siteDot.classList.remove('is-paused');
      siteDot.classList.add('is-unavailable');
      if (siteStatusPill) {
        siteStatusPill.classList.remove('is-paused');
        siteStatusPill.classList.add('is-unavailable');
        siteStatusPill.textContent = 'N/A';
      }
      if (siteSubtitle) siteSubtitle.textContent = 'Unavailable on this page';
      excludeSiteBtn.disabled = true;
      excludeSiteBtn.classList.remove('is-excluded');
      excludeSiteBtn.innerHTML = '<span>🚫</span> Cannot Exclude This Page';
      excludeSiteBtn.title = 'Smart AutoComplete does not run on this page';
      return;
    }

    siteDot.classList.remove('is-unavailable');
    if (siteStatusPill) siteStatusPill.classList.remove('is-unavailable');
    excludeSiteBtn.disabled = false;

    const disabledList = Array.isArray(currentSettings.disabledDomains) ? currentSettings.disabledDomains : [];
    const isExcluded = disabledList.some(d => currentDomain === d || currentDomain.endsWith('.' + d));

    if (isExcluded) {
      siteDot.classList.add('is-paused');
      if (siteStatusPill) {
        siteStatusPill.classList.add('is-paused');
        siteStatusPill.textContent = 'Excluded';
      }
      if (siteSubtitle) siteSubtitle.textContent = 'Excluded on this site';
      excludeSiteBtn.classList.add('is-excluded');
      excludeSiteBtn.innerHTML = '<span>✅</span> Re-enable Current Site';
      excludeSiteBtn.title = 'Remove ' + currentDomain + ' from excluded sites';
    } else {
      siteDot.classList.remove('is-paused');
      if (siteStatusPill) {
        siteStatusPill.classList.remove('is-paused');
        siteStatusPill.textContent = 'Active';
      }
      if (siteSubtitle) siteSubtitle.textContent = 'Active on this site';
      excludeSiteBtn.classList.remove('is-excluded');
      excludeSiteBtn.innerHTML = '<span>🚫</span> Exclude Current Site';
      excludeSiteBtn.title = 'Exclude ' + currentDomain + ' from Smart AutoComplete';
    }
  }

  function toggleDomainState() {
    if (!isSupportedSite || !currentDomain) return;
    chrome.runtime.sendMessage({ type: 'TOGGLE_DOMAIN_PAUSE', domain: currentDomain }, (res) => {
      if (res && res.success) {
        currentSettings.disabledDomains = res.disabledDomains;
        updateDomainUI();
      }
    });
  }

  if (excludeSiteBtn) {
    excludeSiteBtn.addEventListener('click', toggleDomainState);
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
