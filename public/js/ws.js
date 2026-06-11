function connectWs(onMessage) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/ws`);

  ws.onmessage = (e) => {
    const event = JSON.parse(e.data);
    onMessage(event);
  };

  ws.onclose = () => {
    setTimeout(() => connectWs(onMessage), 3000);
  };

  return ws;
}
