import {plumeTheme} from "vuepress-theme-plume";
import navbar from "../navbar/index.js";
import {notes} from "../sidebar/index.js";

export default plumeTheme({
    logo: '/home.png',
    profile: {
        name: 'YYJ',
        description: '业精于勤,荒与嬉.',
        avatar: '/home.png',
        circle: true, // 是否为圆形头像
    },
    locales: {
        '/': {
            selectLanguageName: '简体中文',
            selectLanguageText: '选择语言',
        },
        '/en/': {
            selectLanguageName: 'English',
            selectLanguageText: 'Language',
        }
    },
    repo: 'https://github.com/yangjiaoshou20/yw-docs', //默认识别为GitHub用户名和仓库名
    editLink: false,
    navbar,
    notes,
    footer: {
        message: 'Power by yw & vuepress-theme-plume',
        copyright: 'Copyright © 2024-present yyj'
    },
    notFound: ['未找到正确的页面'],
    backToHome: '返回首页',
})