// ReadableStream / WritableStream / DecompressionStream mínimos (ADR-0650 /
// SPEC-0651). O caminho que importa: Blob.stream() → pipeThrough(new
// DecompressionStream(fmt)) → new Response(stream).arrayBuffer(). O inflate é
// C++ (__cortexInflate), numa travessia só, no close do lado gravável.
// ponytail: filas sem backpressure/highWaterMark, sem tee()/BYOB.

const FORMATS = ['deflate', 'deflate-raw', 'gzip'];

function settleWaiters(stream) {
  while (stream.__waiters.length && (stream.__queue.length || stream.__closed || stream.__error)) {
    const waiter = stream.__waiters.shift();
    if (stream.__queue.length) waiter.resolve({ value: stream.__queue.shift(), done: false });
    else if (stream.__error) waiter.reject(stream.__error);
    else waiter.resolve({ value: undefined, done: true });
  }
}

export function ReadableStreamLite(source) {
  const stream = this;
  this.__source = source || {};
  this.__queue = [];
  this.__waiters = [];
  this.__closed = false;
  this.__error = null;
  this.locked = false;
  this.__controller = {
    enqueue: function (chunk) {
      if (stream.__closed || stream.__error) throw new TypeError('ReadableStream is closed');
      stream.__queue.push(chunk);
      settleWaiters(stream);
    },
    close: function () {
      stream.__closed = true;
      settleWaiters(stream);
    },
    error: function (reason) {
      if (stream.__closed || stream.__error) return;
      stream.__error = reason;
      stream.__queue.length = 0;
      settleWaiters(stream);
    },
  };
  if (this.__source.start) {
    try {
      Promise.resolve(this.__source.start(this.__controller)).catch(this.__controller.error);
    } catch (e) {
      this.__controller.error(e);
    }
  }
}

ReadableStreamLite.prototype.__read = function () {
  const stream = this;
  const pending = new Promise(function (resolve, reject) {
    stream.__waiters.push({ resolve: resolve, reject: reject });
  });
  settleWaiters(this);
  if (this.__waiters.length && this.__source.pull) {
    try {
      Promise.resolve(this.__source.pull(this.__controller)).catch(this.__controller.error);
    } catch (e) {
      this.__controller.error(e);
    }
  }
  return pending;
};

ReadableStreamLite.prototype.cancel = function (reason) {
  this.__queue.length = 0;
  this.__closed = true;
  settleWaiters(this);
  if (this.__source.cancel) return Promise.resolve(this.__source.cancel(reason));
  return Promise.resolve();
};

ReadableStreamLite.prototype.getReader = function () {
  if (this.locked) throw new TypeError('ReadableStream is locked');
  const stream = this;
  this.locked = true;
  return {
    read: function () { return stream.__read(); },
    releaseLock: function () { stream.locked = false; },
    cancel: function (reason) { return stream.cancel(reason); },
  };
};

ReadableStreamLite.prototype.pipeTo = function (destination) {
  const reader = this.getReader();
  const writer = destination.getWriter();
  function step() {
    return reader.read().then(function (result) {
      if (result.done) {
        reader.releaseLock();
        return writer.close().then(function () { writer.releaseLock(); });
      }
      return writer.write(result.value).then(step);
    });
  }
  return step().catch(function (reason) {
    writer.abort(reason);
    throw reason;
  });
};

// O erro do pipe chega ao `readable` pelo abort do `writable` (como no browser).
ReadableStreamLite.prototype.pipeThrough = function (transform) {
  this.pipeTo(transform.writable).catch(function () {});
  return transform.readable;
};

if (typeof Symbol !== 'undefined' && Symbol.asyncIterator) {
  ReadableStreamLite.prototype[Symbol.asyncIterator] = function () {
    const reader = this.getReader();
    return {
      next: function () { return reader.read(); },
      return: function () {
        reader.releaseLock();
        return Promise.resolve({ value: undefined, done: true });
      },
    };
  };
}

export function WritableStreamLite(sink) {
  this.__sink = sink || {};
  this.__chain = Promise.resolve();
  this.locked = false;
}

// Chamadas ao sink em série; a primeira falha trava as próximas.
WritableStreamLite.prototype.__enqueue = function (method, arg) {
  const sink = this.__sink;
  this.__chain = this.__chain.then(function () {
    if (sink[method]) return sink[method](arg);
    return undefined;
  });
  return this.__chain;
};

WritableStreamLite.prototype.getWriter = function () {
  if (this.locked) throw new TypeError('WritableStream is locked');
  const stream = this;
  this.locked = true;
  return {
    write: function (chunk) { return stream.__enqueue('write', chunk); },
    close: function () { return stream.__enqueue('close'); },
    abort: function (reason) {
      if (stream.__sink.abort) return Promise.resolve(stream.__sink.abort(reason));
      return Promise.resolve();
    },
    releaseLock: function () { stream.locked = false; },
  };
};

function chunkBytes(chunk) {
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
  if (ArrayBuffer.isView(chunk)) return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  throw new TypeError('DecompressionStream: chunk must be an ArrayBuffer or ArrayBufferView');
}

function concatBytes(chunks) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return merged;
}

export function DecompressionStreamLite(format) {
  const name = String(format);
  if (FORMATS.indexOf(name) < 0) {
    throw new TypeError("DecompressionStream: unsupported format '" + name + "'");
  }
  const chunks = [];
  let output = null;
  this.readable = new ReadableStreamLite({ start: function (c) { output = c; } });
  this.writable = new WritableStreamLite({
    write: function (chunk) { chunks.push(chunkBytes(chunk)); },
    close: function () {
      const bytes = __cortexInflate(concatBytes(chunks), name);
      if (bytes === null) {
        const error = new TypeError('DecompressionStream: invalid ' + name + ' data');
        output.error(error);
        throw error;
      }
      output.enqueue(new Uint8Array(bytes));
      output.close();
    },
    abort: function (reason) { output.error(reason); },
  });
}

export function installStreamShims() {
  if (typeof globalThis.ReadableStream === 'undefined') globalThis.ReadableStream = ReadableStreamLite;
  if (typeof globalThis.WritableStream === 'undefined') globalThis.WritableStream = WritableStreamLite;
  if (typeof globalThis.DecompressionStream === 'undefined') {
    globalThis.DecompressionStream = DecompressionStreamLite;
  }
}
