import {resolve} from "path"
import minimatch from "minimatch"
import { normalizePath } from 'vite'
import {parseComponent as parseSFC} from "vue/compiler-sfc"
import {parse as acornParse} from "acorn"
import MagicString from "magic-string"
import {walk} from "estree-walker"

/**
 * 将通过minimatch匹配的vue文件，注入对应的mixin
 * @param {array} options 配置对象数组，所有路径都是相对于项目根目录
 *          [{
 *            include:"src/pages/*.vue", //包含文件正则
 *            exclude:null,              //忽略文件正则，默认null，
 *            mixins:["build/mixins/page.js"],  //要注入的mixin文件地址数组
 *          }] 
 * @returns 
 */
export default function (options) {
  let transformer 
  return {
    name: 'vite-plugin-vue-mixins',
    enforce: 'pre',
    // apply: 'build', // 或 'serve'
    configResolved(resolvedConfig) {
      transformer = new Transformer(options,resolvedConfig.root)
    },
    transform(source,id){
      const result = transformer.transform(id,source)
      return result||source
    }
  }
}

/**
 *代码注入转换类
 *
 * @class Transformer
 */
class Transformer{
  constructor(options,root){
    root = root||process.cwd()
    options = options||[]
    this.options = options.map(option=>{
      option.include = option.include && normalizePath(resolve(root,option.include))
      option.exclude = option.exclude && normalizePath(resolve(root,option.exclude))
      option.mixins = option.mixins && option.mixins.map(mixin=>normalizePath(resolve(root,mixin)))
      return option
    })
  }

  // 获取与当前页面地址相匹配的配置信息，返回匹配的对象合并集合
  _getMatched(id){
    let matched = []
    this.options.forEach(option => {
      if(minimatch(id,option.include) 
        && (!option.exclude || !minimatch(id,option.exclude) )){
        matched = matched.concat(option.mixins||[])
      }
    });
    // console.debug(id,matched)
    return matched
  }
  /**
   *根据获取的注入信息，注入js代码，返回转换后的源码和找到的非原生属性扩展
   *
   * @param {string} id      文件id  (全路径)
   * @param {string} source  文件源码
   * @returns code || null
   * @memberof Transformer
   */
  transform(id,source){
    const matched = this._getMatched(id)
    if(matched.length==0){
      return null
    }
    const mixins = []
    const mixinsVarName = '__mixins'
    let hasMixin=false
    let content = ''
    //====1 inject import mixins&props
    matched.forEach((mixinPath,i) => {
      const mixinName = '__mixin_'+i
      mixins.push(mixinName)
      content +=`import ${mixinName} from "${mixinPath}";`
    });
    content+=`const ${mixinsVarName} = [${mixins.join()}];`
    const sfc = parseSFC(source);
    // console.debug(sfc,matched)
    //====2 init source
    if(sfc.script && sfc.script.content.trim()){
      content+=sfc.script.content
    }else{
      content+='export default {}'
    }
    //====3 ast track and modify
    const ast = acornParse(content, {ecmaVersion: 2020,sourceType:'module'})
    let s = new MagicString(content)
    walk(ast, {
      enter(node, parent, prop, index) {
        // if(node.type=='ExportDefaultDeclaration'){
        //   hasDefault = true
        // }
        if(prop=='declaration' && node.type=='ObjectExpression' && parent.type=="ExportDefaultDeclaration"){
          node.properties.forEach(protoItem => {
            // =====4 found mixins  prepend inject 
            if(protoItem.key.name=='mixins' && mixins.length>0){
              hasMixin = true
              if(protoItem.shorthand){
                // 简写   改为非简写并合并变量
                s.appendRight(protoItem.key.end,`:${mixinsVarName}.concat(${protoItem.key.name})`)
              }else if(protoItem.value.type=='Identifier' || protoItem.value.type=="ArrayExpression"){
                // 为变量或者数组   直接合并
                s.appendLeft(protoItem.value.start,`${mixinsVarName}.concat(`)
                s.appendRight(protoItem.value.end,`)`)
              }
            }
          })
          // 5 not mixins proptype, prepend inject 
          if(!hasMixin && mixins.length>0){
            s.appendRight(node.start+1,`mixins:${mixinsVarName},`)
          }
          this.skip()
        }
      },
      // leave(node, parent, prop, index) {
      // }
    })
    // ==== 6 组织最终代码
    const scriptContent =s.toString()
    let dst
    if(sfc.script){
      dst = source.split('')
      dst.splice(sfc.script.start,sfc.script.end-sfc.script.start,scriptContent)
      dst = dst.join('')
    }else{
      dst = source+`<script>${scriptContent}</script>`
      // log("no script:",dst)
    }
    return dst
  }
}