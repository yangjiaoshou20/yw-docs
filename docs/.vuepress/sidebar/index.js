import {defineCollections} from 'vuepress-theme-plume'

import {frontEnd} from './front-end'
import {backEnd} from './back-end'
import {devops} from './devops'

export const collections = defineCollections([
    frontEnd,
    backEnd,
    devops,
])
