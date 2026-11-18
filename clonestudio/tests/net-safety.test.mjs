import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import {
  assertPublicHttpUrl,
  assertPublicHttpUrlResolved,
  followSafeRedirects,
  isPrivateAddress,
  isPrivateIpv4,
  pinnedLookup,
  readLimited,
  requestPinned,
  resolvePublicHttpUrl,
} from '../server/net-safety.mjs';

const PUBLIC_IP = '93.184.216.34';

const payload = '<h1>ok</h1>';
const server = http.createServer((req, res) => {
  if (req.url === '/gzip') {
    const body = zlib.gzipSync(Buffer.from(payload));
    res.writeHead(200, {
      'content-type': 'text/html',
      'content-encoding': 'gzip',
      'content-length': body.length,
    });
    res.end(body);
    return;
  }
  if (req.url === '/deflate') {
    const body = zlib.deflateSync(Buffer.from(payload));
    res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'deflate' });
    res.end(body);
    return;
  }
  if (req.url === '/big') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('x'.repeat(4096));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end(payload);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const localPort = server.address().port;
const localUrl = (pathname) => new URL(`http://example.invalid:${localPort}${pathname}`);
const pinned = [{ address: '127.0.0.1', family: 4 }];

test.after(() => {
  server.close();
});

test('isPrivateIpv4 reconhece faixas internas e reservadas', () => {
  for (const ip of [
    '0.0.0.0',
    '10.1.2.3',
    '127.0.0.1',
    '100.64.0.1',
    '169.254.10.10',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.8',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
  ]) {
    assert.equal(isPrivateIpv4(ip), true, ip);
  }
  assert.equal(isPrivateIpv4('8.8.8.8'), false);
  assert.equal(isPrivateIpv4('172.32.0.1'), false);
  assert.equal(isPrivateIpv4('nao-e-ip'), false);
});

test('isPrivateAddress cobre IPv6, IPv4 mapeado e hosts vazios', () => {
  for (const address of [
    '',
    '::',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '::ffff:7f00:1',
  ]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  assert.equal(isPrivateAddress('2001:4860:4860::8888'), false);
  assert.equal(isPrivateAddress(PUBLIC_IP), false);
});

test('assertPublicHttpUrl aceita IP público e rejeita esquemas/hosts internos', () => {
  assert.equal(assertPublicHttpUrl(`http://${PUBLIC_IP}/`).hostname, PUBLIC_IP);
  for (const url of [
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://metadata.google.internal/',
    'http://algo.home.arpa/',
    'ftp://example.com/arquivo',
    'javascript:alert(1)',
  ]) {
    assert.throws(() => assertPublicHttpUrl(url), /inválido|locais|privados|http/i, url);
  }
});

test('resolvePublicHttpUrl devolve os IPs validados sem nova consulta', async () => {
  const { url, addresses } = await resolvePublicHttpUrl(`https://${PUBLIC_IP}/caminho`);
  assert.equal(url.hostname, PUBLIC_IP);
  assert.deepEqual(addresses, [{ address: PUBLIC_IP, family: 4 }]);
  await assert.rejects(() => resolvePublicHttpUrl('http://10.0.0.1/'), /locais|privados/i);
  const resolved = await assertPublicHttpUrlResolved(`https://${PUBLIC_IP}/caminho`);
  assert.equal(resolved.hostname, PUBLIC_IP);
});

test('pinnedLookup só entrega os endereços já aprovados', () => {
  const lookup = pinnedLookup([
    { address: '203.0.113.10', family: 4 },
    { address: '2001:db8::10', family: 6 },
  ]);
  const all = new Promise((resolve, reject) => {
    lookup('exemplo.test', { all: true }, (error, addresses) =>
      error ? reject(error) : resolve(addresses),
    );
  });
  return all.then((addresses) => {
    assert.equal(addresses.length, 2);
    const single = new Promise((resolve, reject) => {
      lookup('exemplo.test', { family: 4 }, (error, address, family) =>
        error ? reject(error) : resolve({ address, family }),
      );
    });
    return single.then((record) => {
      assert.deepEqual(record, { address: '203.0.113.10', family: 4 });
      const onlyV4 = pinnedLookup([{ address: '203.0.113.10', family: 4 }]);
      const mismatch = new Promise((resolve, reject) => {
        onlyV4('exemplo.test', { family: 6 }, (error, address, family) =>
          error ? reject(error) : resolve({ address, family }),
        );
      });
      return assert.rejects(() => mismatch, /Nenhum endereço público válido/i);
    });
  });
});

test('requestPinned conecta ao IP fixado mesmo com domínio que não resolve', async () => {
  const response = await requestPinned(localUrl('/plain'), {}, pinned);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), payload);
});

test('requestPinned descomprime gzip e deflate', async () => {
  const gzip = await requestPinned(localUrl('/gzip'), {}, pinned);
  assert.equal(gzip.headers.get('content-encoding'), null);
  assert.equal(await gzip.text(), payload);

  const deflate = await requestPinned(localUrl('/deflate'), {}, pinned);
  assert.equal(await deflate.text(), payload);
});

test('requestPinned rejeita quando não há endereço aprovado', async () => {
  await assert.rejects(
    () => requestPinned(localUrl('/plain'), {}, []),
    /Nenhum endereço público válido/i,
  );
});

test('followSafeRedirects revalida o destino de cada redirect', async () => {
  const calls = [];
  const fakeRequest = async (url) => {
    calls.push(String(url));
    return new Response(null, {
      status: 302,
      headers: { location: 'http://127.0.0.1/segredo' },
    });
  };
  await assert.rejects(
    () => followSafeRedirects(`http://${PUBLIC_IP}/`, {}, fakeRequest),
    /locais|privados/i,
  );
  assert.equal(calls.length, 1, 'não deve buscar o destino interno');
});

test('followSafeRedirects limita a quantidade de redirects', async () => {
  const fakeRequest = async () =>
    new Response(null, {
      status: 307,
      headers: { location: `http://${PUBLIC_IP}/loop` },
    });
  await assert.rejects(
    () => followSafeRedirects(`http://${PUBLIC_IP}/`, {}, fakeRequest),
    /redireciona vezes demais/i,
  );
});

test('followSafeRedirects converte 303 em GET e remove o corpo', async () => {
  const seen = [];
  const fakeRequest = async (url, options) => {
    seen.push({ url: String(url), method: options.method || 'GET', body: options.body });
    if (seen.length === 1) {
      return new Response(null, {
        status: 303,
        headers: { location: `/final` },
      });
    }
    return new Response('ok', { status: 200 });
  };
  const response = await followSafeRedirects(
    `http://${PUBLIC_IP}/`,
    { method: 'POST', body: 'x=1' },
    fakeRequest,
  );
  assert.equal(response.status, 200);
  assert.equal(seen.length, 2);
  assert.equal(seen[1].method, 'GET');
  assert.equal(seen[1].body, undefined);
  assert.equal(seen[1].url, `http://${PUBLIC_IP}/final`);
});

test('readLimited respeita content-length e o limite durante o stream', async () => {
  const declared = new Response('curto', {
    headers: { 'content-length': '999999' },
  });
  await assert.rejects(() => readLimited(declared, 1024), /grande demais/i);

  const big = await requestPinned(localUrl('/big'), {}, pinned);
  await assert.rejects(() => readLimited(big, 1024), /grande demais/i);

  const ok = new Response('conteudo');
  const buffer = await readLimited(ok, 1024);
  assert.equal(buffer.toString('utf8'), 'conteudo');
});
