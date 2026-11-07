import { env, pipeline } from '@huggingface/transformers';

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
if (import.meta.env.PROD) env.backends.onnx.wasm.wasmPaths = undefined;

let model;
self.onmessage = async ({ data }) => {
  const { samples, language } = data;
  try {
    if (!model) {
      self.postMessage({ state: 'loading' });
      model = pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny', {
        revision: 'ff4177021cc41f7db950912b73ea4fdf7d01d8e7',
        device: 'wasm', dtype: 'q8',
        progress_callback(progress) {
          if (progress.status === 'progress' && progress.total > 1000000) {
            self.postMessage({ state: 'loading', percent: Math.floor(progress.progress) });
          }
        },
      }).catch(error => { model = null; throw error; });
    }
    const transcribe = await model;
    self.postMessage({ state: 'transcribing' });
    const result = await transcribe(samples, {
      task: 'transcribe', chunk_length_s: 28, stride_length_s: 4,
      ...(language === 'auto' ? {} : { language }),
    });
    self.postMessage({ state: 'done', text: result.text.trim() });
  } catch {
    self.postMessage({ state: 'error' });
  }
};
