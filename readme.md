vue sfc 文件mixins注入插件， 请使用vue2.7.x

### install

```
pnpm i vite-plugin-vue-mixins
```

### usage:

```
#vite.config.js

import vueMixins from "vite-plugin-vue-mixins"
...
plugins: [
  vueMixin([{
    include:"src/pages/**/*.vue",
    exclude:"src/pages/user/*.vue",
    mixins:["mixins/page.js"],
  },
  ...
  ]),
...
```

### options

参数是配置对象数组，所有路径都是相对于项目根目录，每个对象的参数：

```
include,              //包含文件正则, 参考minimatch
exclude,              //忽略文件正则，默认null，
mixins,               //要注入的mixin文件地址数组
```