import * as path from 'node:path'
import {defineUserConfig, type UserConfig} from 'vuepress'
import { viteBundler } from '@vuepress/bundler-vite'
import {backToTopPlugin} from "@vuepress/plugin-back-to-top"
import theme from "./theme/index.js";

export default defineUserConfig({
  base: '/',
  lang: 'zh-CN',
  source: path.resolve(__dirname, '../'),
  public: path.resolve(__dirname, 'public'),
  locales: {
    '/': { title: '鹦鹉文档', lang: 'zh-CN' },
    '/en/': { title: 'YW docs', lang: 'en-US' },
  },
  head: [
    ['link', {rel: 'icon', href: '/favicon.ico'}],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/home.png' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/home.png' }],
  ],
  title: '鹦鹉文档',
  description: '业精于勤，荒于嬉。',
  theme: theme,
  plugins: [
    backToTopPlugin(),
  ],

  bundler: viteBundler(),
}) as UserConfig
