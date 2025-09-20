(async () => {
  const uaih = 'https://uaih.london/';
  const popup = window.open(uaih, '_blank', 'width=600,height=600');
  await new Promise((resolve) => {
    popup.onload = () => {
      setTimeout(() => {
        resolve();
      }, 500);
    };
  });

  popup.postMessage({
    type: 'INIT',
    message: 'Hello from ' + window.location + ' at ' + new Date()
  }, uaih);

  alert('Message sent to ' + uaih);

})()