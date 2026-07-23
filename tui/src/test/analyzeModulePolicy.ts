import { componentExportViolations } from '@test/analyzeComponentExports.ts';
import { constantViolations } from '@test/analyzeConstants.ts';
import { stateExportViolations } from '@test/analyzeStateExports.ts';

export function analyzeModulePolicy(
  files: string[],
  relativeFile: (file: string) => string
) {
  return {
    componentExportViolations: files
      .filter((file) => {
        const relative = relativeFile(file);
        return relative.startsWith('components/') && !relative.includes('/__tests__/');
      })
      .flatMap((file) => componentExportViolations(file, relativeFile))
      .sort(),
    constantViolations: files
      .filter((file) => {
        const relative = relativeFile(file);
        return relative.startsWith('constants/') && !relative.includes('/__tests__/');
      })
      .flatMap((file) => constantViolations(file, relativeFile)),
    stateExportViolations: files
      .filter((file) => {
        const relative = relativeFile(file);
        return relative.startsWith('state/') && !relative.includes('/__tests__/');
      })
      .flatMap((file) => stateExportViolations(file, relativeFile))
      .sort()
  };
}
