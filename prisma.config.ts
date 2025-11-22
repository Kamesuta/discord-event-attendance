import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;

const prismaConfig = defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
    ...(shadowDatabaseUrl ? { shadowDatabaseUrl: env('SHADOW_DATABASE_URL') } : {}),
  },
});

export default prismaConfig;
