import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #7c5cfc 0%, #5347d1 100%)',
          borderRadius: '40px',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          width="100"
          height="100"
        >
          <path
            d="M4 4L12 20L20 4"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
