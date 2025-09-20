async function bookmarklet () {
  const uaih = 'https://uaih.london/';
  console.log('opening...');
  const popup = window.open(uaih, 'UAIH');
  await new Promise((resolve) => {
    const keepPinging = setInterval(() => {
      console.log('pinging...');
      popup.postMessage({ type: 'ping' }, uaih);
    }, 100);

    window.addEventListener('message', handleMessage);
    function handleMessage(event) {
      if (event.data.type === 'pong') {
        console.log('received pong', event.data);
        clearInterval(keepPinging);
        window.removeEventListener('message', handleMessage);
        resolve();
      }
    }
  });

  popup.postMessage({
    type: 'INIT',
    message: 'Hello from ' + window.location + ' at ' + new Date()
  }, uaih);

  await new Promise(resolve => setTimeout(resolve, 500));

  alert('Message sent to popup!');

}
