// cmd 入口 - bench 评测
// testcases + BenchmarkRunner.RunSuite（注入真实 provider）

import { BenchmarkRunner, type TestCase } from "../../eval/benchmark.js";

const testcases: TestCase[] = [
    {
        id: "test_001_edit",
        name: "测试模糊替换工具的准确性",
        setupScript: 'echo \'{"name": "teemo", "version": "v1.0.0"}\' > config.json',
        taskPrompt:
            "当前目录下有一个 config.json。请使用 edit_file 工具，" +
            "将其中的 version 从 v1.0.0 改为 v2.0.0。",
        validateScript: 'grep \'"version": "v2.0.0"\' config.json',
    },
];

async function main(): Promise<void> {
    const { OpenAIProvider } = await import("../../provider/openai.js");
    const provider = new OpenAIProvider("glm-4.5-air");
    const runner = new BenchmarkRunner("glm-4.5-air", provider);
    const results = await runner.runSuite(testcases);
    printReport(results);
}

function printReport(results: { passed: boolean; totalCostCNY: number }[]): void {
    const passed = results.filter((r) => r.passed).length;
    const totalCost = results.reduce((sum, r) => sum + r.totalCostCNY, 0);
    console.log(`=== 跑分报告 ===`);
    console.log(`通过: ${passed}/${results.length}`);
    console.log(`总花费: ¥${totalCost.toFixed(6)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    void main();
}
