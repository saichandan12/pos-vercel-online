module.exports = async (_req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, ts: new Date().toISOString() }));
};

