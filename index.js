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

/**
 * @type {{
 *  hubId: string,
 *  frameId: string,
 *  origin: string,
 *  services?: string[],
 *  listEntry: HTMLElement
 * }[]}
 */
var registeredHubRemotes = [];


/** @type {HTMLElement} */
var interactiveContainer;

/** @type {BroadcastChannel} */
var hubsChannel;
/** @type {string} */
var hubId;

/** @param {MessageEvent} event */
async function handleMessage(event) {
  const type = event.data?.type;
  if (typeof type !== 'string') return;

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

  registeredEntry.source.postMessage(
    response,
    { targetOrigin: registeredEntry.origin });
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

    return {type: 'pong', frameId: alreadyRegistered.frameId };
  } else {
    const newListEntry = document.createElement('div');
    newListEntry.className = 'listEntry';

    if (!registeredHubRemotes.length && !registeredRemotes.length) {
      interactiveContainer.textContent = '';
    }

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

    hubsChannel.postMessage({
      type: 'hub-ping',
      origin: newReg.origin,
      entries: [{
        frameId: newReg.frameId,
        services: newReg.services
      }]
    });

    return { type: 'pong', frameId: newReg.frameId };
  }
}

function handleListServices() {
  return registeredRemotes.map(r => ({
    ...r,
    source: undefined
  })).concat(registeredHubRemotes.map(r => ({
    ...r,
    source: undefined
  })));
}

/**
 * @type {{
 *  requestId: string,
 *  startTimestamp: string,
 *  resolve: (value: any) => void,
 *  reject: (reason?: any) => void
 * }[]}
 */
var outstandingServiceCalls = [];

/** @param {MessageEvent} event */
async function handleCallService(event) {
  const { frameId, requestId, targetFrameId, service, ignoreQuietly, ...rest } = event.data;
  const fromFrame = registeredRemotes.find(r => r.source === event.source);
  if (!fromFrame) {
    console.info('CALL-SERVICE>> message.source is not registered', event);
    throw new Error('Source not registered');
  }

  const existingCall = outstandingServiceCalls.find(c => c.requestId === requestId);
  if (existingCall) {
    console.info('CALL-SERVICE>> duplicate requestId', requestId);
    throw new Error('Duplicate requestId ' + requestId);
  }

  let result;
  try {
    result = await makeCall({ frameId, requestId, targetFrameId, service, ignoreQuietly, ...rest });
  } catch (error) {
    fromFrame.source.postMessage(
      {
        type: 'call-service-reply',
        requestId,
        success: false,
        error: /** @type {*} */(error)?.stack || /** @type {*} */(error)?.message || String(error)
      },
      { targetOrigin: fromFrame.origin }
    );
    return;
  }

  fromFrame.source.postMessage(
    {
      type: 'call-service-reply',
      requestId,
      success: true,
      result
    },
    { targetOrigin: fromFrame.origin }
  );
}


/**
 * @param {{
 *  requestId: string,
 *  targetFrameId: string,
 *  service: string,
 *  ignoreQuietly: boolean
 * }} _ */
function makeCall({ requestId, targetFrameId, service, ignoreQuietly, ...rest }) {
  const remoteTo = registeredRemotes.find(r => r.frameId === targetFrameId);
  const remoteHubTo = !remoteTo && registeredHubRemotes.find(r => r.frameId === targetFrameId);

  if (remoteTo) {
    remoteTo.source.postMessage({
      type: 'call-service',
      requestId,
      service,
      ...rest
    },
      { targetOrigin: remoteTo.origin });
  } else if (remoteHubTo) {
    hubsChannel.postMessage({
      type: 'hub-call-service',
      hubId,
      frameId: remoteHubTo.frameId,
      requestId,
      targetFrameId,
      service,
      ...rest
    });
  } else {
    if (ignoreQuietly) return;

    console.info('CALL-SERVICE>> unknown to frameId', targetFrameId);
    throw new Error('Unknown targetFrameId ' + targetFrameId);
  }

  const responsePromise = new Promise((resolve, reject) => {
    outstandingServiceCalls.push({
      requestId,
      startTimestamp: new Date().toISOString(),
      resolve,
      reject
    });
  });

  return responsePromise;
}

/** @param {*} _ */
function handleCallServiceReply({ requestId, success, result, error }) {
  const existingCallIndex = outstandingServiceCalls.findIndex(c => c.requestId === requestId);
  if (existingCallIndex === -1) {
    console.info('CALL-SERVICE-REPLY>> unknown requestId', requestId);
    throw new Error('Unknown requestId ' + requestId);
  }

  const existingCall = outstandingServiceCalls[existingCallIndex];

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

function initBroadcastChannel() {
  hubId = 'h' + Math.random().toString(36).replace(/[^a-z]+/ig, '').slice(1) + ':' + Date.now().toString(36).slice(-5);
  hubsChannel = new BroadcastChannel("my_channel");
  hubsChannel.addEventListener("message", handleBroadcastMessage);

  hubsChannel.postMessage({
    type: 'hub-start',
    hubId
  });

  /** @param {MessageEvent} event */
  function handleBroadcastMessage(event) {
    if (typeof event.data?.type !== 'string') {
      console.info('BROADCAST>> unknown message', event);
      return;
    }

    if (event.data.hubId === hubId) return;

    switch (event.data?.type) {
      case 'hub-ping':
        return handleHubPing(event);

      case 'hub-start':
        return handleHubStart(event);

      case 'hub-call-service':
        return handleHubCallService(event.data);

      case 'hub-call-service-reply':
        return handleHubCallServiceReply(event.data);
    }
  }

  /** @param {MessageEvent} event */
  function handleHubPing(event) {
    const { hubId, origin, entries } = event.data;

    for (const { frameId, services } of entries || []) {
      const alreadyRegistered = registeredHubRemotes.find(r => r.origin === origin && r.frameId === frameId);
      if (alreadyRegistered) {
        console.info('HUB-PING>> already registered ', alreadyRegistered, alreadyRegistered.services, services);

        if (services)
          alreadyRegistered.services = services;
      } else {
        const newListEntry = document.createElement('div');
        newListEntry.className = 'listEntry hubEntry';

        if (!registeredHubRemotes.length && !registeredRemotes.length) {
          interactiveContainer.textContent = '';
        }

        interactiveContainer.appendChild(newListEntry);

        const newHubReg = {
          hubId,
          frameId,
          origin,
          services,
          listEntry: newListEntry
        };

        newListEntry.textContent = newHubReg.origin + ' #' + newHubReg.frameId + ' (hub)';

        registeredHubRemotes.push(newHubReg);
        console.info('HUB-PING>> new registration ', newHubReg, services);
      }
    }
  }

  /** @param {MessageEvent} event */
  function handleHubStart(event) {
    return registeredRemotes.map(r => ({
      ...r,
      hubId,
      source: undefined
    }));
  }

  /** @param {*} _ */
  async function handleHubCallService({ hubId: fromHubId, frameId, requestId, targetFrameId, service, ...rest }) {
    let response;
    try {
      response = await makeCall({
        frameId,
        requestId,
        targetFrameId,
        service,
        ignoreQuietly: true,
        ...rest
      });

      if (!response) return;
    } catch (error) {
      hubsChannel.postMessage({
        type: 'hub-call-service-reply',
        hubId: fromHubId,
        frameId,
        requestId,
        error: /** @type {*} */(error)?.stack || /** @type {*} */(error)?.message || String(error)
      });
    }

    if (response) {
      hubsChannel.postMessage({
        type: 'hub-call-service-reply',
        hubId: fromHubId,
        frameId,
        requestId,
        ...response
      });
    }
  }

  /** @param {*} _ */
  function handleHubCallServiceReply({ requestId, success, result, error }) {
    const existingCallIndex = outstandingServiceCalls.findIndex(c => c.requestId === requestId);
    const existingCall = outstandingServiceCalls[existingCallIndex];
    if (!existingCall) {
      return; // this is a response to a different hub
    }

    if (success) {
      existingCall.resolve(result);
    } else {
      existingCall.reject(error);
    }
  }

}

updateBookmarkletLink();
initInteractivity();