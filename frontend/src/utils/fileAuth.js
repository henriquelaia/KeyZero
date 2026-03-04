/**
 * fileAuth.js
 *
 * Módulo responsável pela gestão de chaves "Hardware" (Ficheiros Locais ou em Pens USB).
 * Usa a File System Access API para permitir uma experiência de "chave física" 
 * através de um mero ficheiro `.keyzero`. O ficheiro contém um ArrayBuffer/String em Base64
 * gerado por valores pseudo-aleatórios fortes.
 */

// Gera 32 bytes de entropia e devolve em Base64
function generateStrongEntropyBase64() {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Pede ao utilizador para guardar um ficheiro .keyzero.
 * Retorna a String do conteúdo para usarmos internamente, ou null em caso de erro/cancelamento.
 */
export async function generateAndSaveKeyFile() {
  const fileContent = generateStrongEntropyBase64();

  // Tenta usar a File System Access API
  if ('showSaveFilePicker' in window) {
    try {
      const opts = {
        suggestedName: 'minha_chave',
        types: [{
          description: 'KeyZero Hardware Key',
          accept: {'text/plain': ['.keyzero']},
        }],
      };
      const fileHandle = await window.showSaveFilePicker(opts);
      const writable = await fileHandle.createWritable();
      await writable.write(fileContent);
      await writable.close();
      return fileContent;
    } catch (error) {
      if (error.name === 'AbortError') return null;
      console.error('Erro ao guardar com showSaveFilePicker:', error);
      // Se der erro esquisito, avança para o fallback
    }
  }

  // Fallback para download clássico
  try {
    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'minha_chave.keyzero';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    return fileContent;
  } catch (error) {
    console.error('Erro no fallback:', error);
    throw new Error('Não foi possível gravar a chave de hardware.');
  }
}

/**
 * Pede ao utilizador para abrir o seu ficheiro .keyzero contendo a chave.
 * Retorna a String com o conteúdo (entropia), ou null.
 */
export async function readKeyFile() {
  // Tenta usar a File System Access API
  if ('showOpenFilePicker' in window) {
    try {
      const opts = {
        types: [{
          description: 'KeyZero Hardware Key',
          accept: {'text/plain': ['.keyzero']},
        }],
        multiple: false
      };
      
      const [fileHandle] = await window.showOpenFilePicker(opts);
      const file = await fileHandle.getFile();
      const contents = await file.text();
      
      if (!contents || contents.trim().length === 0) {
          throw new Error('O ficheiro está vazio ou inválido.');
      }
      
      return contents.trim();
    } catch (error) {
      if (error.name === 'AbortError') return null;
      console.error('Erro ao ler com showOpenFilePicker:', error);
      // Avança para o fallback em vez de lançar erro imediatamente se não for AbortError
    }
  }

  // Fallback: usar o <input type="file"> escondido
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.keyzero';
    input.style.display = 'none';

    let settled = false;

    input.onchange = async (e) => {
      settled = true;
      const file = e.target.files[0];
      if (!file) return resolve(null);
      try {
        const text = await file.text();
        if (!text || text.trim().length === 0) {
          return reject(new Error('O ficheiro está vazio ou inválido.'));
        }
        resolve(text.trim());
      } catch (err) {
        reject(new Error('Não foi possível ler o ficheiro indicado.'));
      } finally {
        document.body.removeChild(input);
      }
    };

    // Detecta cancelamento: quando a janela volta a ter foco e o onchange não disparou
    const onFocus = () => {
      window.removeEventListener('focus', onFocus);
      setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(null);
          if (document.body.contains(input)) document.body.removeChild(input);
        }
      }, 300);
    };
    window.addEventListener('focus', onFocus);

    document.body.appendChild(input);
    input.click();
  });
}
