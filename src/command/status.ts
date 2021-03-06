import { git, gitVersion, IGitExecutionOptions } from '../core/git';
import { parsePorcelainStatus, mapStatus } from '../parser/status-parser';
import { DiffSelectionType, DiffSelection } from '../model/diff';
import { IStatusResult, IAheadBehind, WorkingDirectoryStatus, WorkingDirectoryFileChange, AppFileStatus, FileEntry, GitStatusEntry } from '../model/status';

function convertToAppStatus(status: FileEntry): AppFileStatus {
    if (status.kind === 'ordinary') {
        switch (status.type) {
            case 'added':
                return AppFileStatus.New;
            case 'modified':
                return AppFileStatus.Modified;
            case 'deleted':
                return AppFileStatus.Deleted;
        }
    } else if (status.kind === 'copied') {
        return AppFileStatus.Copied;
    } else if (status.kind === 'renamed') {
        return AppFileStatus.Renamed;
    } else if (status.kind === 'conflicted') {
        return AppFileStatus.Conflicted;
    } else if (status.kind === 'untracked') {
        return AppFileStatus.New;
    }

    throw new Error(`Unknown file status ${status}`);
}

// See: https://git-scm.com/docs/git-status#_short_format
function isChangeInIndex(statusCode: string): boolean {
    const index = statusCode.charAt(0);
    return index === 'M' || index === 'A' || index === 'D' || index === 'U' || index === 'R' || index === 'C';
}

function isChangeInWorkTree(statusCode: string): boolean {
    const [, workingTree] = statusCode;
    return workingTree === 'M' || workingTree === 'A' || workingTree === 'D' || workingTree === 'U';
}

/**
 *  Retrieve the status for a given repository,
 *  and fail gracefully if the location is not a Git repository
 */
export async function getStatus(
    repositoryPath: string,
    noOptionalLocks: boolean = true,
    limit: number = Number.MAX_SAFE_INTEGER,
    options?: IGitExecutionOptions): Promise<IStatusResult> {

    const args: string[] = [];
    if (noOptionalLocks) {
        // We need to check if the configured git version can use it or not. It is supported from 2.15.0
        if (typeof process.env.GIT__CAN_USE_NO_OPTIONAL_LOCKS === 'undefined') {
            console.info(`Checking whether '--no-optional-locks' can be used with the current Git executable. Minimum required version is '2.15.0'.`);
            let version: string | undefined;
            let canUseNoOptionalLocks = false;
            try {
                version = await gitVersion(options);
            } catch (e) {
                console.error('Error ocurred when determining the Git version.', e);
            }
            if (!version) {
                console.warn(`Cannot determine the Git version. Disabling '--no-optional-locks' for all subsequent calls.`);
            } else {
                const parsed = version.replace(/^git version /, '');
                const [rawMajor, rawMinor] = parsed.split('.');
                if (rawMajor && rawMinor) {
                    const major = parseInt(rawMajor, 10);
                    const minor = parseInt(rawMinor, 10);
                    if (Number.isInteger(major) && Number.isInteger(minor)) {
                        canUseNoOptionalLocks = major >= 2 && minor >= 15;
                    }
                }
                if (!canUseNoOptionalLocks) {
                    console.warn(`Git version was: '${parsed}'. Disabling '--no-optional-locks' for all subsequent calls.`);
                } else {
                    console.info(`'--no-optional-locks' is a valid Git option for the current Git version: '${parsed}'.`);
                }
            }
            process.env.GIT__CAN_USE_NO_OPTIONAL_LOCKS = `${canUseNoOptionalLocks}`;
        }
        if (process.env.GIT__CAN_USE_NO_OPTIONAL_LOCKS === 'true') {
            args.push('--no-optional-locks');
        }
    }
    args.push('status', '--untracked-files=all', '--branch', '--porcelain=2', '-z');
    const result = await git(
        args,
        repositoryPath,
        'getStatus',
        options
    );

    const files = new Array<WorkingDirectoryFileChange>();
    // https://github.com/theia-ide/dugite-extra/issues/10
    const existingFiles = new Set<string>();

    let currentBranch: string | undefined = undefined;
    let currentUpstreamBranch: string | undefined = undefined;
    let currentTip: string | undefined = undefined;
    let branchAheadBehind: IAheadBehind | undefined = undefined;

    const { entries, incomplete } = parsePorcelainStatus(result.stdout, limit);
    for (const entry of entries) {
        if (entry.kind === 'entry') {
            const status = mapStatus(entry.statusCode);

            if (status.kind === 'ordinary') {
                // when a file is added in the index but then removed in the working
                // directory, the file won't be part of the commit, so we can skip
                // displaying this entry in the changes list
                if (
                    status.index === GitStatusEntry.Added &&
                    status.workingTree === GitStatusEntry.Deleted
                ) {
                    continue;
                }
            }

            if (status.kind === 'untracked') {
                // when a delete has been staged, but an untracked file exists with the
                // same path, we should ensure that we only draw one entry in the
                // changes list - see if an entry already exists for this path and
                // remove it if found
                if (existingFiles.has(entry.path)) {
                    const existingEntry = files.findIndex(p => p.path === entry.path);
                    if (existingEntry > -1) {
                        files.splice(existingEntry, 1);
                    }
                }
            }

            // for now we just poke at the existing summary
            const summary = convertToAppStatus(status);
            const selection = DiffSelection.fromInitialSelection(
                DiffSelectionType.All
            );

            const changeInIndex = isChangeInIndex(entry.statusCode);
            const changeInWorkingTree = isChangeInWorkTree(entry.statusCode);
            if (changeInIndex) {
                files.push(
                    new WorkingDirectoryFileChange(
                        entry.path,
                        summary,
                        selection,
                        entry.oldPath,
                        true
                    )
                );
                existingFiles.add(entry.path);
            }

            if (changeInWorkingTree) {
                files.push(
                    new WorkingDirectoryFileChange(
                        entry.path,
                        summary,
                        selection,
                        entry.oldPath,
                        false
                    )
                );
                existingFiles.add(entry.path);
            }

            // Must be untracked
            if (!changeInIndex && !changeInWorkingTree) {
                files.push(
                    new WorkingDirectoryFileChange(
                        entry.path,
                        summary,
                        selection,
                        entry.oldPath,
                        false
                    )
                );
                existingFiles.add(entry.path);
            }

        } else if (entry.kind === 'header') {
            let m: RegExpMatchArray | null;
            const value = entry.value;

            // This intentionally does not match branch.oid initial
            if ((m = value.match(/^branch\.oid ([a-f0-9]+)$/))) {
                currentTip = m[1];
            } else if ((m = value.match(/^branch.head (.*)/))) {
                if (m[1] !== '(detached)') {
                    currentBranch = m[1];
                }
            } else if ((m = value.match(/^branch.upstream (.*)/))) {
                currentUpstreamBranch = m[1];
            } else if ((m = value.match(/^branch.ab \+(\d+) -(\d+)$/))) {
                const ahead = parseInt(m[1], 10);
                const behind = parseInt(m[2], 10);

                if (!isNaN(ahead) && !isNaN(behind)) {
                    branchAheadBehind = { ahead, behind };
                }
            }
        }
    }

    const workingDirectory = new WorkingDirectoryStatus(files, true);

    return {
        currentBranch,
        currentTip,
        currentUpstreamBranch,
        branchAheadBehind,
        exists: true,
        workingDirectory,
        incomplete
    };
}