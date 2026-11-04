import * as path from 'node:path'

import {viteBundler} from '@vuepress/bundler-vite'
import {defineUserConfig} from 'vuepress'

import theme from './theme/index.js'

// 站点部署在子路径下，head 中的资源链接不会自动拼接 base，必须手动带上
const base = '/yw-docs/'

export default defineUserConfig({
    base,
    lang: 'zh-CN',
    source: path.resolve(__dirname, '../'),
    public: path.resolve(__dirname, 'public'),
    locales: {
        '/': {title: '鹦鹉文档', lang: 'zh-CN'},
        '/en/': {title: 'YW docs', lang: 'en-US'},
    },
    head: [
        ['link', {rel: 'icon', type: 'image/x-icon', sizes: '16x16 32x32 48x48', href: `${base}favicon.ico`}],
        ['link', {rel: 'apple-touch-icon', sizes: '180x180', href: `${base}home.png`}],
    ],
    title: '鹦鹉文档',
    description: '业精于勤，荒于嬉。',
    theme,
    bundler: viteBundler(),
    port: 8135,
})
