import * as path from 'node:path'
import {defineUserConfig, type UserConfig} from 'vuepress'
import { viteBundler } from '@vuepress/bundler-vite'
import {backToTopPlugin} from "@vuepress/plugin-back-to-top";
import theme from "./theme/index.js";

export default defineUserConfig({
  base: '/',
  lang: 'zh-CN',
  source: path.resolve(__dirname, '../'),
  public: path.resolve(__dirname, 'public'),
  locales: {
    '/': { title: 'Plume 主题', lang: 'zh-CN' },
    '/en/': { title: 'Plume Theme', lang: 'en-US' },
  },
  head: [
    ['link', {rel: 'icon', href: '/favicon.ico'}],
    ['link', {rel: 'icon', href: '/favicon.ico'}]
  ],
  title: '鹦鹉文档',
  description: '业精于勤，荒于嬉。',
  theme: theme,
  plugins: [
    backToTopPlugin(),
  ],

  bundler: viteBundler(),
}) as UserConfig
