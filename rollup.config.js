import { nodeResolve } from '@rollup/plugin-node-resolve';
import { terser } from "rollup-plugin-terser";
import replace from '@rollup/plugin-replace'
import typescript from '@rollup/plugin-typescript'
import rollupUrl from '@rollup/plugin-url';
import commonjs from '@rollup/plugin-commonjs';


var componentPath
var serverPath
if ((process.env.BUILD !== 'production')) {
    componentPath = "https://blair-vue-apps.ngrok.io/vue-apps/";
    serverPath = "https://blair-core.ngrok.io/build/";
} else {
    componentPath = "https://ymastin3.github.io/vue-apps/";
    serverPath = "https://ymastin3.github.io/core-components/";
}

export default ['index', 'main-room'].map((name, index) => ({
    input: `src/rooms/${name}.ts`,
    context: 'window',
    output: [{
        file: `./build/${name}.js`,
        format: 'es',
        sourcemap: 'inline'
    },
    {
        file: `./build/${name}.min.js`,
        format: 'es',
        plugins: [terser()]
    }],
    external: [ componentPath + "dist/hubs.js" ],
    plugins: [
        commonjs(),
        nodeResolve(),
        replace({
            preventAssignment: true,
            'https://ymastin3.github.io/vue-apps/': componentPath //JSON.stringify( componentPath )
        }), 
        typescript({
            typescript: require('typescript'),
        }),
        rollupUrl({
            limit: 1000,
            publicPath: serverPath,
        }),    
    ]
}));
