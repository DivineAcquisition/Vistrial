/**
 * Vistrial Embed Widget Script
 * Add this script to any website to embed the booking widget
 * 
 * Usage:
 * <script src="https://embed.vistrial.io/embed.js" 
 *   data-business="your-slug"
 *   data-mode="popup"
 *   data-button-text="Book Now"
 *   data-button-color="#7c3aed">
 * </script>
 */

(function() {
  'use strict';

  // Get config from script tag
  var script = document.currentScript;
  var businessSlug = script.getAttribute('data-business');
  var mode = script.getAttribute('data-mode') || 'popup'; // popup | inline
  var buttonText = script.getAttribute('data-button-text') || 'Book Now';
  var buttonColor = script.getAttribute('data-button-color') || '#7c3aed';
  var containerId = script.getAttribute('data-container'); // for inline mode

  if (!businessSlug) {
    console.error('Vistrial: data-business attribute is required');
    return;
  }

  var EMBED_URL = 'https://embed.vistrial.io';

  // Create styles
  var styles = document.createElement('style');
  styles.textContent = '\
    .vistrial-button {\
      display: inline-flex;\
      align-items: center;\
      justify-content: center;\
      gap: 8px;\
      padding: 12px 24px;\
      font-size: 16px;\
      font-weight: 600;\
      color: white;\
      background-color: ' + buttonColor + ';\
      border: none;\
      border-radius: 8px;\
      cursor: pointer;\
      transition: opacity 0.2s, transform 0.2s;\
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;\
    }\
    .vistrial-button:hover {\
      opacity: 0.9;\
      transform: translateY(-1px);\
    }\
    .vistrial-button svg {\
      width: 20px;\
      height: 20px;\
    }\
    .vistrial-modal-overlay {\
      position: fixed;\
      top: 0;\
      left: 0;\
      right: 0;\
      bottom: 0;\
      background: rgba(0, 0, 0, 0.5);\
      display: flex;\
      align-items: center;\
      justify-content: center;\
      z-index: 999999;\
      opacity: 0;\
      visibility: hidden;\
      transition: opacity 0.3s, visibility 0.3s;\
    }\
    .vistrial-modal-overlay.open {\
      opacity: 1;\
      visibility: visible;\
    }\
    .vistrial-modal {\
      background: white;\
      border-radius: 16px;\
      width: 90%;\
      max-width: 800px;\
      max-height: 90vh;\
      overflow: hidden;\
      transform: scale(0.95);\
      transition: transform 0.3s;\
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);\
      position: relative;\
    }\
    .vistrial-modal-overlay.open .vistrial-modal {\
      transform: scale(1);\
    }\
    .vistrial-modal-close {\
      position: absolute;\
      top: 12px;\
      right: 12px;\
      width: 32px;\
      height: 32px;\
      border-radius: 50%;\
      background: rgba(0, 0, 0, 0.1);\
      border: none;\
      cursor: pointer;\
      display: flex;\
      align-items: center;\
      justify-content: center;\
      z-index: 10;\
    }\
    .vistrial-modal-close:hover {\
      background: rgba(0, 0, 0, 0.2);\
    }\
    .vistrial-iframe {\
      width: 100%;\
      height: 600px;\
      border: none;\
    }\
    .vistrial-inline-container {\
      width: 100%;\
      border-radius: 12px;\
      overflow: hidden;\
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);\
    }\
    .vistrial-inline-container iframe {\
      width: 100%;\
      min-height: 700px;\
      border: none;\
    }\
  ';
  document.head.appendChild(styles);

  // Calendar icon SVG
  var calendarIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>';

  // Close icon SVG
  var closeIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

  if (mode === 'inline') {
    // Inline mode - embed directly in a container
    var container = containerId 
      ? document.getElementById(containerId)
      : script.parentElement;

    if (container) {
      var wrapper = document.createElement('div');
      wrapper.className = 'vistrial-inline-container';
      wrapper.innerHTML = '<iframe src="' + EMBED_URL + '/' + businessSlug + '" title="Book with Vistrial"></iframe>';
      container.appendChild(wrapper);
    }
  } else {
    // Popup mode - create button and modal
    
    // Create button
    var button = document.createElement('button');
    button.className = 'vistrial-button';
    button.innerHTML = calendarIcon + ' ' + buttonText;
    
    // Create modal
    var modal = document.createElement('div');
    modal.className = 'vistrial-modal-overlay';
    modal.innerHTML = '\
      <div class="vistrial-modal">\
        <button class="vistrial-modal-close">' + closeIcon + '</button>\
        <iframe class="vistrial-iframe" src="' + EMBED_URL + '/' + businessSlug + '" title="Book with Vistrial"></iframe>\
      </div>\
    ';

    // Open modal on button click
    button.addEventListener('click', function() {
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
    });

    // Close modal function
    var closeModal = function() {
      modal.classList.remove('open');
      document.body.style.overflow = '';
    };

    modal.querySelector('.vistrial-modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', function(e) {
      if (e.target === modal) closeModal();
    });

    // Listen for close message from iframe
    window.addEventListener('message', function(e) {
      if (e.data === 'vistrial:close') closeModal();
      if (e.data === 'vistrial:booked') {
        closeModal();
        // Trigger custom event
        window.dispatchEvent(new CustomEvent('vistrial:booking-complete'));
      }
    });

    // Insert button after script tag
    script.parentElement.insertBefore(button, script);
    document.body.appendChild(modal);
  }

  // Listen for resize messages from iframe
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'vistrial:resize') {
      var iframes = document.querySelectorAll('.vistrial-inline-container iframe');
      iframes.forEach(function(iframe) {
        if (iframe.contentWindow === e.source) {
          iframe.style.height = e.data.height + 'px';
        }
      });
    }
  });
})();
