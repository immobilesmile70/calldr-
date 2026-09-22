import React from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

// Web-only root HTML document configuration for Expo Router
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>CalLdr</title>
        <meta name="description" content="Call with a limit. No more, no less." />
        <meta name="theme-color" content="#0E0E11" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body {
                height: 100%;
                margin: 0;
                padding: 0;
                background-color: #0E0E11;
                font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
                -webkit-font-smoothing: antialiased;
              }
              #root {
                display: flex;
                flex-direction: column;
                height: 100%;
                min-height: 100%;
                width: 100%;
              }
              #root > div {
                display: flex;
                flex-direction: column;
                height: 100%;
                flex: 1;
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
