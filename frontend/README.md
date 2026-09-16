# 에코줍줍 프론트엔드

Next.js 16 기반 화면이며 `/chat`의 줍줍이 챗봇과 `/map`의 에코실천지도는 같은 출처의 Route Handler를 통해 로컬 FastAPI 검색 서버에 연결됩니다. Elasticsearch 및 OpenAI API 키는 브라우저로 전달되지 않습니다.

## Getting Started

저장소 루트에서 Elasticsearch와 AI 검색 서버를 먼저 실행합니다.

```bash
./start.sh
./run-ai.sh
```

다른 터미널에서 프론트엔드를 실행합니다.

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

브라우저에서 [http://localhost:3000/chat](http://localhost:3000/chat) 또는 [http://localhost:3000/map](http://localhost:3000/map)을 엽니다.

검색 인덱스 기본값은 `eco-jupjup-vector-v2`, 임베딩 모델은 `intfloat/multilingual-e5-small`입니다. AI 서버 주소를 바꾸려면 프론트엔드 루트의 `.env.local`에 `AI_SERVER_URL=http://127.0.0.1:8000`을 지정합니다.

LLM 답변을 사용하려면 저장소 루트의 `.env`에 아래 값을 직접 추가합니다. 키가 없거나 호출에 실패하면 챗봇은 Elasticsearch 검색 결과를 바탕으로 만든 기본 요약으로 자동 전환됩니다.

```dotenv
OPENAI_API_KEY=your-key-here
OPENAI_MODEL=gpt-5.6-luna
```

카카오 지도 타일과 마커를 표시하려면 프론트엔드의 `frontend/.env.local`에 JavaScript 키를 넣습니다. 이 값은 브라우저에서 사용되는 공개용 앱 키이므로 OpenAI 비밀키와 섞지 마세요.

```dotenv
NEXT_PUBLIC_KAKAO_MAP_KEY=your-kakao-javascript-key
KAKAO_REST_API_KEY=your-kakao-rest-api-key
```

`KAKAO_REST_API_KEY`는 현재 위치에서 선택 장소까지의 자동차 경로를 서버에서 계산할 때 사용합니다. 브라우저로 전달되지 않으며, 챗봇 장소 결과의 `지도에서 경로 보기`를 누르면 경로 좌표를 카카오 지도 위에 표시합니다.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
