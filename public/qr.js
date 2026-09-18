(() => {
  const VERSION = 3;
  const SIZE = 17 + VERSION * 4;
  const DATA_CODEWORDS = 55;
  const EC_CODEWORDS = 15;
  const FORMAT_MASK = 0;
  const FORMAT_LEVEL = 1; // Error correction level L.

  const expTable = new Uint8Array(512);
  const logTable = new Uint8Array(256);
  let fieldValue = 1;
  for (let index = 0; index < 255; index += 1) {
    expTable[index] = fieldValue;
    logTable[fieldValue] = index;
    fieldValue <<= 1;
    if (fieldValue & 0x100) fieldValue ^= 0x11d;
  }
  for (let index = 255; index < expTable.length; index += 1) expTable[index] = expTable[index - 255];

  function multiply(left, right) {
    if (!left || !right) return 0;
    return expTable[logTable[left] + logTable[right]];
  }

  function bitLength(value) {
    let length = 0;
    while (value) {
      length += 1;
      value >>>= 1;
    }
    return length;
  }

  function bchTypeInfo(value) {
    let remainder = value << 10;
    const generator = 0x537;
    while (bitLength(remainder) >= bitLength(generator)) {
      remainder ^= generator << (bitLength(remainder) - bitLength(generator));
    }
    return ((value << 10) | remainder) ^ 0x5412;
  }

  function makeGenerator() {
    let generator = [1];
    for (let index = 0; index < EC_CODEWORDS; index += 1) {
      const next = new Array(generator.length + 1).fill(0);
      const root = expTable[index];
      generator.forEach((coefficient, coefficientIndex) => {
        next[coefficientIndex] ^= coefficient;
        next[coefficientIndex + 1] ^= multiply(coefficient, root);
      });
      generator = next;
    }
    return generator;
  }

  const generator = makeGenerator();

  function makeErrorCorrection(data) {
    const errorCorrection = new Array(EC_CODEWORDS).fill(0);
    data.forEach((byte) => {
      const factor = byte ^ errorCorrection[0];
      for (let index = 0; index < EC_CODEWORDS - 1; index += 1) errorCorrection[index] = errorCorrection[index + 1];
      errorCorrection[EC_CODEWORDS - 1] = 0;
      for (let index = 0; index < EC_CODEWORDS; index += 1) {
        errorCorrection[index] ^= multiply(generator[index + 1], factor);
      }
    });
    return errorCorrection;
  }

  function makeCodewords(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    const capacity = DATA_CODEWORDS * 8;
    const bits = [];
    const addBits = (value, length) => {
      for (let index = length - 1; index >= 0; index -= 1) bits.push((value >>> index) & 1);
    };
    if (bytes.length > 50) throw new Error('手机地址太长，暂时无法生成二维码');
    addBits(0b0100, 4);
    addBits(bytes.length, 8);
    bytes.forEach((byte) => addBits(byte, 8));
    for (let index = 0; index < Math.min(4, capacity - bits.length); index += 1) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let index = 0; index < bits.length; index += 8) {
      data.push(bits.slice(index, index + 8).reduce((value, bit) => (value << 1) | bit, 0));
    }
    const pads = [0xec, 0x11];
    let padIndex = 0;
    while (data.length < DATA_CODEWORDS) {
      data.push(pads[padIndex % pads.length]);
      padIndex += 1;
    }
    return data.concat(makeErrorCorrection(data));
  }

  function makeMatrix(text) {
    const modules = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    const set = (row, column, value) => {
      if (row >= 0 && row < SIZE && column >= 0 && column < SIZE) modules[row][column] = Boolean(value);
    };
    const setIfEmpty = (row, column, value) => {
      if (row >= 0 && row < SIZE && column >= 0 && column < SIZE && modules[row][column] === null) set(row, column, value);
    };
    const placeFinder = (top, left) => {
      for (let row = -1; row <= 7; row += 1) {
        for (let column = -1; column <= 7; column += 1) {
          const inPattern = row >= 0 && row <= 6 && column >= 0 && column <= 6;
          const dark = inPattern && (row === 0 || row === 6 || column === 0 || column === 6 || (row >= 2 && row <= 4 && column >= 2 && column <= 4));
          set(top + row, left + column, dark);
        }
      }
    };
    const placeAlignment = (centerRow, centerColumn) => {
      for (let row = -2; row <= 2; row += 1) {
        for (let column = -2; column <= 2; column += 1) {
          setIfEmpty(centerRow + row, centerColumn + column, Math.max(Math.abs(row), Math.abs(column)) !== 1);
        }
      }
    };

    placeFinder(0, 0);
    placeFinder(0, SIZE - 7);
    placeFinder(SIZE - 7, 0);
    placeAlignment(22, 22);
    for (let index = 8; index < SIZE - 8; index += 1) {
      setIfEmpty(6, index, index % 2 === 0);
      setIfEmpty(index, 6, index % 2 === 0);
    }

    const formatBits = bchTypeInfo((FORMAT_LEVEL << 3) | FORMAT_MASK);
    for (let index = 0; index < 15; index += 1) {
      const dark = ((formatBits >>> index) & 1) === 1;
      if (index < 6) set(index, 8, dark);
      else if (index < 8) set(index + 1, 8, dark);
      else set(SIZE - 15 + index, 8, dark);
      if (index < 8) set(8, SIZE - index - 1, dark);
      else if (index < 9) set(8, 15 - index, dark);
      else set(8, 15 - index - 1, dark);
    }
    set(SIZE - 8, 8, true);

    const codewords = makeCodewords(text);
    const dataBits = [];
    codewords.forEach((byte) => {
      for (let index = 7; index >= 0; index -= 1) dataBits.push((byte >>> index) & 1);
    });
    let bitIndex = 0;
    let upward = true;
    for (let column = SIZE - 1; column > 0; column -= 2) {
      if (column === 6) column -= 1;
      for (let offset = 0; offset < SIZE; offset += 1) {
        const row = upward ? SIZE - 1 - offset : offset;
        for (const currentColumn of [column, column - 1]) {
          if (modules[row][currentColumn] !== null) continue;
          let dark = dataBits[bitIndex] === 1;
          bitIndex += 1;
          if ((row + currentColumn) % 2 === 0) dark = !dark;
          modules[row][currentColumn] = dark;
        }
      }
      upward = !upward;
    }
    return modules;
  }

  function render(canvas, text) {
    const modules = makeMatrix(text);
    const quietZone = 4;
    const scale = 6;
    const fullSize = (SIZE + quietZone * 2) * scale;
    canvas.width = fullSize;
    canvas.height = fullSize;
    canvas.setAttribute('aria-label', `扫码打开 ${text}`);
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, fullSize, fullSize);
    context.fillStyle = '#152634';
    modules.forEach((row, rowIndex) => row.forEach((dark, columnIndex) => {
      if (dark) context.fillRect((columnIndex + quietZone) * scale, (rowIndex + quietZone) * scale, scale, scale);
    }));
  }

  globalThis.SummerQr = { render };
})();
