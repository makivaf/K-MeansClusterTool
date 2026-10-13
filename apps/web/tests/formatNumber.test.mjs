import assert from 'node:assert/strict';
import fs from 'node:fs'; import vm from 'node:vm'; import ts from 'typescript';
const module={exports:{}}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/utils/formatNumber.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:module.exports,Intl,Map,Number,Math});
const {formatNumber}=module.exports;
const expected={metric:'1.23457',sd:'1.23457',difference:'1.23457',ari:'1.23457',calculation:'1.234568',percentage:'1.23457%',percentage1:'1.23457%',correlation:'1.23457',correlationCell:'1.23',correlationTooltip:'1.23457',loading:'1.23457',eigenvalue:'1.23457',delta:'1.23457',gamma:'1.23457',rho:'1.23457',lme:'1.23457',pValue:'1.23457',count:'1',axis:'1.235',axis2:'1.23457',axisTick2:'1.23',axisPercentage:'1.23%',duration:'1.23457'};
for(const [kind,value] of Object.entries(expected)) assert.equal(formatNumber(1.23456789,kind),value,kind);
assert.equal(formatNumber(0.00001,'pValue'),'0.00001'); assert.equal(formatNumber(.001,'pValue'),'0.00100');
assert.equal(formatNumber(2437,'count'),'2,437'); assert.equal(formatNumber(-.000001,'metric'),'0.00000');
assert.equal(formatNumber(undefined),'\u2014'); assert.equal(formatNumber(NaN),'\u2014');
assert.equal(formatNumber(.331697426-.331875010,'difference'),'-0.00018');
console.log('PASS every number kind, unavailable values, thousands separators, five-decimal p-values, negative zero and unrounded differences');

assert.equal(formatNumber(42,'rho'),'42'); assert.equal(formatNumber(.123456789,'calculation'),'0.123457');
