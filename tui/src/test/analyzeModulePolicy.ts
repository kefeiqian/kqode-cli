import { componentExportViolations } from '@test/analyzeComponentExports.ts';
import { constantViolations } from '@test/analyzeConstants.ts';

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
      .flatMap((file) => constantViolations(file, relativeFile))
  };
}
