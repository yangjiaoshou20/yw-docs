import { defineUserConfig } from 'vuepress'
import { viteBundler } from '@vuepress/bundler-vite'

import {backToTopPlugin} from "@vuepress/plugin-back-to-top";
import theme from "./theme/index.js";

export default defineUserConfig({
  lang: 'zh-CN',
  // lang: 'en-US', // 默认站点语言为英文
  locales: {
    '/': {
      selectLanguageName: '简体中文',
    },
    '/en/': {
      selectLanguageName: 'English',
    },
  },
  head: [['link', { rel: 'icon', href: '/favicon.ico' }]],
  title: '鹦鹉文档',
  description: '业精于勤，荒于嬉。',
  theme: theme,
  plugins: [
    backToTopPlugin(),
  ],

  bundler: viteBundler(),
})
