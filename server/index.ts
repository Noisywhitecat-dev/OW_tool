import 'dotenv/config';
import { Store } from './store';
import { createApp } from './app';

const store = new Store();
await store.initialize();
const port = Number(process.env.PORT || 3001);
createApp(store).listen(port, '127.0.0.1', () => {
  console.log(`OW Compass: http://127.0.0.1:${port}`);
  console.log(process.env.OPENAI_API_KEY ? 'OpenAI key configured.' : 'Demo mode: set OPENAI_API_KEY in .env for live research.');
});
