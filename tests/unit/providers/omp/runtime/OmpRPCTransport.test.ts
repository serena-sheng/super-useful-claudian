import { PassThrough } from 'node:stream';

import { OmpRPCTransport } from '@/providers/omp/runtime/OmpRPCTransport';

const flush = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

function createTransport() {
  const input = new PassThrough();
  const output = new PassThrough();
  const writes: string[] = [];
  output.on('data', chunk => writes.push(chunk.toString('utf8')));
  const transport = new OmpRPCTransport({ input, output });
  transport.start();
  return { input, output, transport, writes };
}

describe('OmpRPCTransport protocol negotiation', () => {
  it('negotiates chunked protocol v2 and reassembles a chunked response', async () => {
    const { input, output, transport, writes } = createTransport();
    try {
      input.write(JSON.stringify({
        type: 'ready', protocolVersion: 1, supportedProtocolVersions: [1, 2],
        maxFrameBytes: 1048576, maxReassembledFrameBytes: 8388608,
      }) + '\n');
      await flush();
      expect(writes).toHaveLength(1);
      const negotiate = JSON.parse(writes[0]);
      expect(negotiate).toMatchObject({ protocolVersion: 2, type: 'negotiate_protocol' });

      input.write(JSON.stringify({
        type: 'response', id: negotiate.id, command: 'negotiate_protocol',
        success: true, data: { protocolVersion: 2 },
      }) + '\n');

      const response = transport.request('get_available_models');
      await flush();
      expect(writes).toHaveLength(2);
      const request = JSON.parse(writes[1]);
      expect(request.type).toBe('get_available_models');

      const payload = JSON.stringify({
        type: 'response', id: request.id, success: true, data: { models: [{ id: 'm'.repeat(64) }] },
      });
      const bytes = Buffer.from(payload, 'utf8');
      const count = 3;
      const chunkBytes = Math.ceil(bytes.byteLength / count);
      for (let index = 0; index < count; index += 1) {
        const slice = bytes.subarray(index * chunkBytes, Math.min(bytes.byteLength, (index + 1) * chunkBytes));
        input.write(JSON.stringify({
          type: 'rpc_chunk', chunkId: 'rpc-1', index, count, byteLength: bytes.byteLength,
          data: slice.toString('base64'),
        }) + '\n');
      }

      await expect(response).resolves.toEqual({ models: [{ id: 'm'.repeat(64) }] });
    } finally {
      transport.dispose();
      input.destroy();
      output.destroy();
    }
  });

  it('stays on protocol v1 when the peer does not advertise chunked frames', async () => {
    const { input, output, transport, writes } = createTransport();
    try {
      input.write(JSON.stringify({ type: 'ready', protocolVersion: 1, supportedProtocolVersions: [1] }) + '\n');
      await flush();
      expect(writes).toEqual([]);
    } finally {
      transport.dispose();
      input.destroy();
      output.destroy();
    }
  });

  it('drops invalid and misordered chunks without closing the transport', async () => {
    const { input, output, transport } = createTransport();
    try {
      const response = transport.request('get_state');
      const payload = JSON.stringify({
        type: 'response', id: 'req_1', success: true, result: { ok: true },
      });
      const bytes = Buffer.from(payload, 'utf8');
      const split = Math.ceil(bytes.byteLength / 2);
      // A chunk that does not start its assembly and a non-integer index are dropped.
      input.write(JSON.stringify({
        type: 'rpc_chunk', chunkId: 'bad', index: 1, count: 2, byteLength: bytes.byteLength,
        data: bytes.subarray(split).toString('base64'),
      }) + '\n');
      input.write(JSON.stringify({
        type: 'rpc_chunk', chunkId: 'bad', index: 0.5, count: 2, byteLength: bytes.byteLength, data: '',
      }) + '\n');
      expect(transport.isClosed).toBe(false);

      input.write(JSON.stringify({
        type: 'rpc_chunk', chunkId: 'ok', index: 0, count: 2, byteLength: bytes.byteLength,
        data: bytes.subarray(0, split).toString('base64'),
      }) + '\n');
      input.write(JSON.stringify({
        type: 'rpc_chunk', chunkId: 'ok', index: 1, count: 2, byteLength: bytes.byteLength,
        data: bytes.subarray(split).toString('base64'),
      }) + '\n');

      await expect(response).resolves.toEqual({ ok: true });
    } finally {
      transport.dispose();
      input.destroy();
      output.destroy();
    }
  });
});
