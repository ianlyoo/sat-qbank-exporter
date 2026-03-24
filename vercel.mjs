const workerBaseUrl = String(process.env.SAT_WORKER_BASE_URL || '').replace(/\/+$/, '');

if (!workerBaseUrl) {
  throw new Error(
    'SAT_WORKER_BASE_URL is required for Vercel deployments. Set it to your external worker base URL, for example https://sat-qbank-worker.onrender.com.'
  );
}

export const config = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  framework: null,
  installCommand: '',
  buildCommand: '',
  outputDirectory: 'public',
  cleanUrls: true,
  rewrites: [
    {
      source: '/api/:path*',
      destination: `${workerBaseUrl}/api/:path*`,
    },
  ],
};
