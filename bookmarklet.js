async function bookmarklet () {
  const uaih = 'https://uaih.london/';
  console.log('opening...');
  const popup = window.open(uaih, 'UAIH');
  const frameId = await new Promise((resolve) => {
    const keepPinging = setInterval(() => {
      console.log('pinging...');
      popup.postMessage({ type: 'ping' }, uaih);
    }, 100);

    window.addEventListener('message', handlePongMessage);
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


  function handleMessage(event) {

  }

}
