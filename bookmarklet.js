// @ts-check

async function bookmarklet(uaih = 'https://uaih.london/') {
  console.log('opening...');
  const popup = window.open(uaih, 'UAIH');
  if (!popup) {
    console.error('failed to open popup for ' + uaih);
    return;
  }

  const chatService = detectChatService();

  const frameId = await new Promise((resolve) => {
    const keepPinging = setInterval(() => {
      console.log('pinging...');
      popup.postMessage({
        type: 'ping',
        services: chatService ? ['chat'] : []
      }, uaih);
    }, 100);

    window.addEventListener('message', handlePongMessage);
    /** @param {MessageEvent} event */
    function handlePongMessage(event) {
      if (event.data.type === 'pong') {
        console.log('received pong', event.data);
        clearInterval(keepPinging);
        window.removeEventListener('message', handlePongMessage);
        resolve(event.data.frameId);
      }
    }
  });

  await new Promise(resolve => setTimeout(resolve, 500));

  window.addEventListener('message', handleMessage);


  /** @param {MessageEvent} event */
  async function handleMessage(event) {
    if (event.data.type === 'call-service' && event.data.service === 'chat' && chatService) {
      try {
        const reply = await chatService.handleChatServiceMessage(event);
        console.info('Chat service reply:', reply);

        event.source?.postMessage(
          {
            ...event.data,
            type: 'chat-service-reply',
            ...reply
          },
          { targetOrigin: event.origin }
        );
      } catch (error) {
        console.error('Error handling chat service message:', error);
        event.source?.postMessage(
          {
            type: 'chat-service-reply',
            error: /** @type {*} */(error)?.stack || /** @type {*} */(error)?.message || String(error)
          },
          { targetOrigin: event.origin }
        );
      }
    }
  }

  function detectChatService() {
    if (/gemini.google.com/i.test(window.location.hostname)) {
      return connectGemini();
    }
  }

  function connectGemini() {
    const pageBounds = document.documentElement.getBoundingClientRect();

    // input appears in the lower part of the screen, taking substantial width
    const input = /** @type {HTMLInputElement} */(
      [...document.querySelectorAll('[contentEditable][role=textbox]')].find(input => {
      const inputBounds = input.getBoundingClientRect();
      return inputBounds.top > pageBounds.height * 0.7 && inputBounds.width > pageBounds.width * 0.4;
      })
    );

    const controlsExist = input && (findStopButton() || findMicButton());

    if (!controlsExist) {
      console.info('No chat controls found on this page.');
      return;
    }

    return {
      handleChatServiceMessage
    };

    /** @param {MessageEvent} event */
    async function handleChatServiceMessage(event) {
      await waitTillSettled();

      input.value = event.data.prompt;

      await new Promise(resolve => setTimeout(resolve, 100));

      await waitTillSettled();

      // TODO: send Enter key event instead of clicking the button
      input.dispatchEvent(
        new KeyboardEvent(
          'keydown',
          {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true
          }));
      
      await waitTillSettled();

      const replyElement = /** @type {HTMLElement} */([...document.querySelectorAll('message-content')].pop());
      if (replyElement) {
        replyElement.style.zoom = '0.2';
        replyElement.style.transform = 'scaleX(2)';
        replyElement.style.transformOrigin = 'left';

        return replyElement.textContent;
      }

      async function waitTillSettled() {
        while (true) {
          const micButton = findMicButton();
          if (micButton) return /** @type {HTMLButtonElement} */(micButton);

          const stopButton = findStopButton();
          if (!stopButton) {
            await new Promise(resolve => setTimeout(resolve, 100));
            continue;
          }
        /** @type {HTMLButtonElement} */(stopButton).click();
        }
      }
    }

    /**
     * 
     * @param {Element} el
     * @param {string | ((el: Element) => boolean)} selector
     * @returns {Element | undefined}
     */
    function getParentAs(el, selector) {
      let parent = el.parentElement;
      while (parent) {
        if (typeof selector === 'string' ? parent.matches(selector) : selector(parent))
          return parent;
        parent = parent.parentElement;
      }
    }

    function findStopButton() {
      const pageBounds = document.documentElement.getBoundingClientRect();
      // stop icon appears in the lower right part of the screen
      const stopButton = [...document.querySelectorAll('[data-mat-icon-name=stop]')].find(stopIcon => {
        const stopIconBounds = stopIcon.getBoundingClientRect();
        if (stopIconBounds.top > pageBounds.height * 0.7 && stopIconBounds.right > pageBounds.width * 0.6) {
          return getParentAs(stopIcon, 'button');
        }
      });

      return stopButton;
    }

    function findMicButton() {
      const pageBounds = document.documentElement.getBoundingClientRect();
      // mic icon appears in the lower right part of the screen
      const micButton = [...document.querySelectorAll('[data-mat-icon-name=mic]')].filter(stopIcon => {
        const stopIconBounds = stopIcon.getBoundingClientRect();
        if (stopIconBounds.top > pageBounds.height * 0.7 && stopIconBounds.right > pageBounds.width * 0.6) {
          return getParentAs(stopIcon, 'button');
        }
      }).pop();

      return micButton;
    }
  }

}
