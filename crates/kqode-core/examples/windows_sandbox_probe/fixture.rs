use std::{
    fs, io,
    path::{Path, PathBuf},
    process::Command,
};

const ALL_APPLICATION_PACKAGES: &str = "S-1-15-2-1";

/// Owns exactly one newly created temporary fixture tree, never an existing workspace.
pub(super) struct Fixture {
    root: PathBuf,
}

impl Fixture {
    pub fn new(sid: &str) -> io::Result<Self> {
        let root =
            std::env::temp_dir().join(format!("kqode-sandbox-probe-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root)?;
        let fixture = Self { root };
        fixture.populate(sid)?;
        Ok(fixture)
    }

    fn populate(&self, sid: &str) -> io::Result<()> {
        for directory in ["read", "write", "outside", "capture", "scratch"] {
            fs::create_dir(self.root.join(directory))?;
        }
        for name in [
            "read\\data.txt",
            "outside\\private.txt",
            "outside\\shared.txt",
            "outside\\linked.txt",
        ] {
            fs::write(self.root.join(name), "original")?;
        }
        grant(&self.root, sid, "(OI)(CI)(RX)")?;
        grant(&self.root.join("write"), sid, "(OI)(CI)(M)")?;
        grant(&self.root.join("scratch"), sid, "(OI)(CI)(M)")?;
        grant(
            &self.root.join("outside\\shared.txt"),
            ALL_APPLICATION_PACKAGES,
            "(M)",
        )?;
        fs::hard_link(
            self.root.join("outside\\linked.txt"),
            self.root.join("write\\alias.txt"),
        )?;
        // ACLs belong to the file object: this changes the outside alias as well.
        grant(&self.root.join("write\\alias.txt"), sid, "(M)")?;
        Ok(())
    }

    pub fn root(&self) -> &Path {
        &self.root
    }
    pub fn reset(&self) -> io::Result<()> {
        for name in [
            "read\\data.txt",
            "outside\\private.txt",
            "outside\\shared.txt",
            "outside\\linked.txt",
        ] {
            fs::write(self.root.join(name), "original")?;
        }
        Ok(())
    }
    pub fn outside_alias_changed(&self) -> io::Result<bool> {
        Ok(fs::read_to_string(self.root.join("outside\\linked.txt"))? != "original")
    }
    pub fn close(self) -> io::Result<()> {
        fs::remove_dir_all(&self.root)
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        if self.root.exists()
            && let Err(error) = fs::remove_dir_all(&self.root)
        {
            eprintln!(
                "sandbox probe cleanup failed at {}: {error}",
                self.root.display()
            );
        }
    }
}

pub(super) fn grant(path: &Path, sid: &str, rights: &str) -> io::Result<()> {
    let system_root =
        std::env::var_os("SystemRoot").ok_or_else(|| io::Error::other("SystemRoot unavailable"))?;
    let output = Command::new(PathBuf::from(system_root).join("System32\\icacls.exe"))
        .arg(path)
        .arg("/grant")
        .arg(format!("*{sid}:{rights}"))
        .output()?;
    if !output.status.success() {
        return Err(io::Error::other(format!(
            "fixture ACL grant failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }
    Ok(())
}
