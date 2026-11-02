import type {ThemeOptions} from 'vuepress-theme-plume'
import {plumeTheme} from 'vuepress-theme-plume'

import navbar from '../navbar/index.js'
import {collections} from '../sidebar/index.js'

const themeOptions: ThemeOptions = {
    logo: '/home.png',
    profile: {
        name: 'YYJ',
        description: '业精于勤,荒于嬉.',
        avatar: '/home.png',
        circle: true,
    },
    locales: {
        '/': {
            selectLanguageName: '简体中文',
            selectLanguageText: '选择语言',
        },
        '/en/': {
            selectLanguageName: 'English',
            selectLanguageText: 'Language',
        },
    },
    docsRepo: 'https://github.com/yangjiaoshou20/yw-docs',
    editLink: false,
    navbar,
    collections,
    footer: {
        message: 'Power by yw & vuepress-theme-plume',
        copyright: 'Copyright © 2024-present yyj',
    },
    notFound: {
        title: '未找到正确的页面',
        linkText: '返回首页',
    },
}

export default plumeTheme(themeOptions)
