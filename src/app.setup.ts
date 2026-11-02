import { VersioningType } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { requestIdMiddleware } from './common/request-id';
import { AppConfig } from './config/app-config.service';
import { serveWebApp } from './web-app';

/** HTTP-level configuration shared by main.ts and the e2e test harness. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(AppConfig);

  // Number of proxies in front of the app, so req.ip is the real client (rate limiting).
  // Too low and every visitor shares a proxy's limit; set per platform (render.yaml).
  app.set('trust proxy', config.get('TRUST_PROXY'));
  app.use(requestIdMiddleware);
  app.use(helmet());
  const origins = config.get('CORS_ORIGINS');
  app.enableCors({
    origin: origins.length > 0 ? origins : false,
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Idempotent-Replayed'],
  });
  app.useBodyParser('json', { limit: '10kb' });
  // URI versioning (/v1/...) rather than a global prefix, so Nest's JSON 404 and error
  // handlers cover every path. Health routes are version-neutral.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();
  serveWebApp(app);

  if (config.get('SWAGGER_ENABLED')) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Wallet Service')
        .setDescription(
          'User accounts, wallets and concurrency-safe, idempotent transfers. Amounts are integers in minor units.',
        )
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document, { swaggerOptions: { persistAuthorization: true } });
  }
}
