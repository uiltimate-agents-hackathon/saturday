// @ts-check

/**
 * @type {{
 *  source: MessageEventSource,
 *  frameId: string,
 *  origin: string,
 *  services?: string[],
 *  listEntry: HTMLElement
 * }[]}
 */
var registeredRemotes = [];

/** @type {HTMLElement} */
var interactiveContainer;

/** @param {MessageEvent} event */
async function handleMessage(event) {
  const type = event.data?.type;
  if (type !== 'string') return;

  const checkedEvent = /** @type {CheckedMessageEvent} */ (event);

  if (typeof checkedEvent.source?.postMessage !== 'function') {
    console.info('MESSAGE>> message.source has no postMessage', event);
    return;
  }

  const response = await (async () => {
    try {
      switch (type) {
        case 'ping':
          return handlePing(checkedEvent);

        case 'list-services':
          return handleListServices();

        case 'call-service':
          return handleCallService(checkedEvent.data);

        case 'call-service-reply':
          return handleCallServiceReply(checkedEvent.data);
      }
    } catch (error) {
    }
  })();

  if (response === undefined) {
    console.info('MESSAGE>> no response for message', event);
    return;
  }

  const registeredEntry = registeredRemotes.find(r => r.source === checkedEvent.source);
  if (!registeredEntry) {
    console.info('MESSAGE>> message.source is not registered', event);
    return;
  }

  registeredEntry.source.postMessage(response, { targetOrigin: registeredEntry.origin });
}

/**
 * @typedef {MessageEvent & {
 *  source: { postMessage: NonNullable<MessageEventSource['postMessage']> }
 * }} CheckedMessageEvent
 */

/** @param {CheckedMessageEvent} event */
function handlePing(event) {
  const alreadyRegistered = registeredRemotes.find(r => r.source === event.source);
  if (alreadyRegistered) {
    console.info('PING>> already registered ', alreadyRegistered, alreadyRegistered.services, event.data.services);

    if (event.data.services)
      alreadyRegistered.services = event.data.services;

    event.source.postMessage({ type: 'pong', frameId: alreadyRegistered.frameId }, { targetOrigin: event.origin });
  } else {
    const newListEntry = document.createElement('div');
    newListEntry.className = 'listEntry';
    interactiveContainer.appendChild(newListEntry);

    const newReg = {
      source: event.source,
      frameId: Math.random().toString(36).replace(/[^a-z]+/ig, '').slice(1) + ':' + Date.now().toString(36).slice(-5),
      origin: event.origin,
      services: event.data.services,
      listEntry: newListEntry
    };

    newListEntry.textContent = newReg.origin + ' #' + newReg.frameId;

    registeredRemotes.push(newReg);
    console.info('PING>> new registration ', newReg);

    event.source.postMessage({ type: 'pong', frameId: newReg.frameId }, { targetOrigin: event.origin });
  }
}

function handleListServices() {
  return registeredRemotes.map(r => ({
    ...r,
    source: undefined
  }));
}

/**
 * @type {{
 *  from: typeof registeredRemotes[number],
 *  to: typeof registeredRemotes[number],
 *  requestId: string,
 *  startTimestamp: string,
 *  resolve: (value: any) => void,
 *  reject: (reason?: any) => void
 * }[]}
 */
var outstandingServiceCalls = [];

/** @param {*} _ */
function handleCallService({ frameId, requestId, targetFrameId, service, ...rest }) {
  const existingCall = outstandingServiceCalls.find(c => c.requestId === requestId);
  if (existingCall) {
    console.info('CALL-SERVICE>> duplicate requestId', requestId);
    throw new Error('Duplicate requestId ' + requestId);
  }

  const remoteFrom = registeredRemotes.find(r => r.frameId === frameId);
  const remoteTo = registeredRemotes.find(r => r.frameId === targetFrameId);

  if (!remoteFrom) {
    console.info('CALL-SERVICE>> unknown from frameId', frameId);
    throw new Error('Unknown frameId ' + frameId);
  }

  if (!remoteTo) {
    console.info('CALL-SERVICE>> unknown to frameId', targetFrameId);
    throw new Error('Unknown targetFrameId ' + targetFrameId);
  }

  const responsePromise = new Promise((resolve, reject) => {
    outstandingServiceCalls.push({
      from: remoteFrom,
      to: remoteTo,
      requestId,
      startTimestamp: new Date().toISOString(),
      resolve,
      reject
    });
  });

  remoteTo.source.postMessage({
    type: 'call-service',
    frameId: remoteTo.frameId,
    requestId,
    service,
    ...rest
  }, { targetOrigin: remoteTo.origin });

  return responsePromise;
}

/** @param {*} _ */
function handleCallServiceReply({ frameId, requestId, success, result, error }) {
  const existingCallIndex = outstandingServiceCalls.findIndex(c => c.requestId === requestId);
  if (existingCallIndex === -1) {
    console.info('CALL-SERVICE-REPLY>> unknown requestId', requestId);
    throw new Error('Unknown requestId ' + requestId);
  }

  const existingCall = outstandingServiceCalls[existingCallIndex];
  if (existingCall.to.frameId !== frameId) {
    console.info('CALL-SERVICE-REPLY>> frameId does not match the call', { expected: existingCall.to.frameId, got: frameId });
    throw new Error('frameId does not match the call');
  }

  outstandingServiceCalls.splice(existingCallIndex, 1);

  if (success)
    existingCall.resolve(result);
  else
    existingCall.reject(error);
}

function updateBookmarkletLink() {
  [document.querySelector('#bookmarkletLink')].forEach(
    /** @param {Partial<HTMLAnchorElement> | null} el */(el) => {
    if (!el) return;
    el.href = 'javascript:(bookmarklet=' + bookmarklet + ', console.log("bookmarklet " + bookmarklet()))';
  });
}

function initInteractivity() {
  if (interactiveContainer) return;

  interactiveContainer = document.createElement('div');
  interactiveContainer.id = 'interactiveContainer';
  interactiveContainer.textContent = 'Waiting for connections...';

  document.body.appendChild(interactiveContainer);
}

window.addEventListener('message', handleMessage);
updateBookmarkletLink();
initInteractivity();