#! /usr/bin/env node

const path = require('path');
const fs = require('fs');
const execSync = require('child_process').execSync;
const readline = require('readline');

const packages = require('../bookshop-packages.json');
const ver = process.argv[2];

const run = async () => {
    const next = nextVersion(packages.version);
    if (!ver) {
        console.log(box(`Packages are currently @ ${packages.version}
                         Next version looks like ${next}
                         Use: \`./publish.js next\` to bump and release
                         Use: \`./publish.js <version>\` release a different version`));
        process.exit(0);
    }
    
    let version = ver;
    switch (ver) {
        case 'next':
            version = next;
            break;
        case 'current':
            version = packages.version;
            break;
        case 'vendor':
            console.log(`* Vendoring`);
            vendorGems(packages.rubygems, packages.version);
            console.log(`* * Vendoring done`);
            process.exit(0);
        case 'git':
            steps.updateGit(packages.version);
            process.exit(0);
        case 'test':
            console.log(`* Vendoring`);
            vendorGems(packages.rubygems, version);
            console.log(`* * Vendoring done`);
        
            console.log(`* Running tests`);
            await steps.test(packages);
            console.log(`* * Tests passed`);
            process.exit(0);
    }

    if (!checkVersion(version)) {
        console.error(box(`Invalid version: \`${version}\`
                           Cancelling publish, versions have not been changed.`));
        process.exit(1);
    }
    console.log(box(`Publishing ${version}`));

    steps.ensureReady();

    console.log(`* Setting versions`);
    versionNpm(Object.keys(packages.npm), version);
    versionGems(Object.keys(packages.rubygems), version);
    console.log(`* * Versions set`);

    console.log(`* Vendoring`);
    vendorGems(packages.rubygems, version);
    console.log(`* * Vendoring done`);

    console.log(`* Running tests`);
    await steps.test(packages);
    console.log(`* * Tests passed`);

    packages.version = version;
    fs.writeFileSync(path.join(__dirname, '../bookshop-packages.json'), JSON.stringify(packages, null, 2));
    console.log(`* * bookshop-packages.json updated`);

    console.log(`* Publishing packages`);
    console.log(`* * Please supply an OTP code for npm`);
    const otp = await question(`OTP Code: `);

    console.log(`* * Publishing...`);
    const npmPublishResults = await publishNPM(Object.keys(packages.npm), version, otp);
    const gemPublishResults = await publishGems(Object.keys(packages.rubygems), version);
    const publishFailures = [...npmPublishResults, ...gemPublishResults].filter(r => r.err).map(r => r.pkg);
    const publishSuccesses = [...npmPublishResults, ...gemPublishResults].filter(r => !r.err).map(r => `${pad(`[${r.version}]`, 20)} ${r.pkg}`);

    if (publishFailures.length) {
        console.error(`* * Publishing failed for the following packages:`);
        console.error(`* * ⇛ ${publishFailures.join('\n* * ⇛ ')}`);
        console.error(`* * The following packages __have__ been published:`);
        console.error(`* * ⇛ ${publishSuccesses.join('\n* * ⇛ ')}`);
        console.log(`\n` + box(`Publishing hit an error. Versions have been changed.
                         To re-run this publish, use \`./publish.js current\``));
        process.exit(1);
    }

    steps.updateGit(version);

    console.log(`\n` + box(`All packages published:
                     ⇛ ${publishSuccesses.join('\n⇛ ')}`));
}

const steps = {
    ensureReady: async () => {
        const gitStatus = execSync('git status --porcelain', {stdio: "pipe"});
        if (gitStatus.toString().length) {
            console.error(box(`Git is dirty. Please commit or stash your changes first.`));
            process.exit(1);
        }
    },
    test: async (packages) => {
        process.stdout.write(`* * `);
        const npmTestResults = await testNPM(Object.keys(packages.npm));
        const gemTestResults = await testGems(Object.keys(packages.rubygems));
        const testFailures = [...npmTestResults, ...gemTestResults].filter(r => r.err);
        console.log(`🏁`);
        if (testFailures.length) {
            console.error(`* * Tests failed for the following packages:`);
            console.error(`* * ⇛ ${testFailures.map(r => r.pkg).join('\n* * ⇛ ')}`);
            console.log(box(`Cancelling publish, package versions have been changed
                             but bookshop-packages.json has not.
                             
                             You can re-run whatever command you used to publish.`));
            process.exit(1);
        }
    },
    updateGit: async (version) => {
        console.log(`* * Updating git`);
        execSync(`git add -A && git commit -m "Releasing ${version}"`);
        execSync(`git tag -a ${version} -m "Releasing ${version}"`);
        execSync(`git push && git push --tags`);
        console.log(`* * * Git updated`);
    }
}

/**
 * Testing functions
 */
const testNPM = async (pkgs) => {
    const tests = pkgs.map(async (pkg) => {
        return await new Promise((resolve, reject) => {
            try {
                execSync(`yarn --cwd ${pkg} test`, {stdio: "ignore"});
                resolve({pkg, err: null});
                process.stdout.write('👏 ');
            } catch (err) {
                resolve({pkg, err});
                process.stdout.write('❌ ');
            }
        });
    });
    return await Promise.all(tests);
}

const testGems = async (pkgs) => {
    const tests = pkgs.map(async (pkg) => {
        return await new Promise((resolve, reject) => {
            try {
                execSync(`cd ${pkg} && bundle exec rake test`, {stdio: "ignore"});
                resolve({pkg, err: null});
                process.stdout.write('👏 ');
            } catch (err) {
                resolve({pkg, err});
                process.stdout.write('❌ ');
            }
        });
    });
    return await Promise.all(tests);
}

/**
 * Publishing functions
 */
const publishNPM = async (pkgs, version, otp) => {
    const releases = pkgs.map(async (pkg) => {
        return await new Promise((resolve, reject) => {
            try {
                const cmd = `yarn --cwd ${pkg} publish --non-interactive --access public --otp ${otp}`;
                console.log(`\n$: ${cmd}`);
                execSync(cmd, {stdio: "inherit"});
                resolve({pkg, version, err: null});
            } catch (err) {
                resolve({pkg, err});
            }
        });
    });
    return await Promise.all(releases);
};

const publishGems = async (pkgs, version) => {
    const gemVersion = formatGemVersion(version);
    const releases = pkgs.map(async (pkg) => {
        return await new Promise((resolve, reject) => {
            try {
                const packageName = path.basename(pkg);
                let cmd = `gem build ${pkg}/${packageName}.gemspec`;
                console.log(`\n$: ${cmd}`);
                execSync(cmd, {stdio: "inherit"})
                cmd = `gem push ${pkg}/${packageName}-${gemVersion}.gem`;
                console.log(`\n$: ${cmd}`);
                execSync(cmd, {stdio: "inherit"})
                execSync(`rm ${pkg}/*.gem`);
                resolve({pkg, version: gemVersion, err: null});
            } catch (err) {
                resolve({pkg, err});
            }
        });
    });
    return await Promise.all(releases);
};


/**
 * Version bumping functions
 */
const checkVersion = ver => /^\d+\.\d+\.\d+(-[a-z]+\.\d+)?$/.test(ver);

const versionNpm = (pkgs, version) => {
    pkgs.forEach(pkg => {
        const yarnBump = execSync(`cd ${pkg} && yarn version ${version}`);
        if (yarnBump.stderr) {
            console.error(box(`yarn version bump failed:
                               ${yarnBump.stderr}`));
            process.exit(1);
        }
    });
};

const formatGemVersion = (ver) => ver.replace(/-/, '.pre.');
const versionGems = (gems, version) => {
    gems.forEach(gem => {
        const packageName = path.basename(gem);
        const packageVersionFile = path.join(__dirname, '../', gem, `lib/${packageName}/version.rb`);
        let versionFileContents = fs.readFileSync(packageVersionFile, 'utf8');
        if (!/VERSION/.test(versionFileContents)) {
            console.error(box(`${packageName} version.rb file does not contain a VERSION constant.`));
            process.exit(1);
        }

        versionFileContents = versionFileContents
            .replace(/VERSION =.*$/gm, `VERSION = "${formatGemVersion(version)}"`); 
        fs.writeFileSync(packageVersionFile, versionFileContents);
    });
};

const nextVersion = (ver) => {
    return ver.replace(/\d+$/, (m) => parseInt(m) + 1);
}

/**
 * Vendoring functions
 */
// TODO: async & error handling
const vendorGems = async (gems, version) => {
    Object.entries(gems).forEach(([gem, opts]) => {
        const target = path.join(__dirname, '../', gem);
        if (opts.vendor_from_npm && opts.vendor_from_npm.length) {
            execSync(`rm -rf ${target}/node_modules && mkdir -p ${target}/node_modules/@bookshop`);
            opts.vendor_from_npm.forEach(pkg => {
                execSync(`cd ${pkg} && yarn pack`);
                execSync(`cd ${pkg} && tar -Pxzf *.tgz`);
                execSync(`cd ${pkg} && cp -R package ${target}/node_modules/@bookshop/${path.basename(pkg)}`);
                execSync(`cd ${pkg} && rm *.tgz && rm -r package`);
            });
        }
    });
};

/**
 * I/O utilities:
 **/
const trim = (str) => str.replace(/^\s+|\s+$/gm, '');
const pad = (str, len) => str + Array(len - str.length + 1).join(' ');
const box = (str) => {
    let lines = trim(str).split('\n');
    const max = lines.reduce((a,b) => a.length > b.length ? a : b);
    lines = lines.map((l) => {
        return `║ ${l + Array(max.length - l.length + 1).join(' ')} ║`;
    });
    lines.unshift(`╔═${max.replace(/./g, '═')}═╗`);
    lines.push(`╚═${max.replace(/./g, '═')}═╝`);
    return lines.join('\n');
}


const question = async (q) => {
    return await new Promise((resolve, reject) => {
        try {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            rl.question(q, (answer) => {
                resolve(answer);
                rl.close();
            });
        } catch (err) {
            reject(err);
        }
    });
}

run();