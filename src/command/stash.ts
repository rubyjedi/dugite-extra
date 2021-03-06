import { git, IGitExecutionOptions } from "../core";

export namespace stash {
    /**
     * Stash the current changes.
     *
     * @param repositoryPath the repository path to the local Git clone.
     * @param message an optional stash message.
     */
    export async function push(repositoryPath: string, message?: string, options?: IGitExecutionOptions): Promise<void> {
        const args: string[] = ['stash', 'push'];
        if (message) {
            args.push('-m', message);
        }
        await git(args, repositoryPath, 'stash', options);
    }

    /**
     * List the current stashes.
     *
     * @param repositoryPath the repository path to the local Git clone.
     */
    export async function list(repositoryPath: string, options?: IGitExecutionOptions): Promise<string[]> {
        const result = await git(['stash', 'list'], repositoryPath, 'stash_list', options);
        return result.stdout !== '' ? result.stdout.trim().split('\n') : [];
    }

    /**
     * Apply the latest stash or the stash with the given id.
     *
     * @param repositoryPath the repository path to the local Git clone.
     * @param id the id of the stash (stash@{n})
     */
    export async function apply(repositoryPath: string, id?: string, options?: IGitExecutionOptions): Promise<void> {
        const args: string[] = ['stash', 'apply'];
        if (id) {
            args.push(id);
        }
        await git(args, repositoryPath, 'stash_apply', options);
    }

    /**
     * Pop the latest stash or the stash with the given id.
     *
     * @param repositoryPath the repository path to the local Git clone.
     * @param id the id of the stash (stash@{n})
     */
    export async function pop(repositoryPath: string, id?: string, options?: IGitExecutionOptions): Promise<void> {
        const args: string[] = ['stash', 'pop'];
        if (id) {
            args.push(id);
        }
        await git(args, repositoryPath, 'stash_pop', options);
    }

    /**
     * Drop the latest stash or the stash with the given id.
     *
     * @param repositoryPath the repository path to the local Git clone.
     * @param id the id of the stash (stash@{n})
     */
    export async function drop(repositoryPath: string, id?: string, options?: IGitExecutionOptions): Promise<void> {
        const args: string[] = ['stash', 'drop'];
        if (id) {
            args.push(id);
        }
        await git(args, repositoryPath, 'stash_drop', options);
    }

    /**
     * Clear the current stashes.
     *
     * @param repositoryPath the repository path to the local Git clone.
     */
    export async function clear(repositoryPath: string, options?: IGitExecutionOptions): Promise<void> {
        await git(['stash', 'clear'], repositoryPath, 'stash_clear', options);
    }
}