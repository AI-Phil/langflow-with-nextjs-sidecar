// pages/upload-files.tsx
import { useState, useRef, useEffect } from 'react';
import {
  TextField,
  Button,
  IconButton,
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText
} from '@mui/material';
import { Remove, Add, Delete, Folder, InsertDriveFile } from '@mui/icons-material';

interface DirectoryInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  webkitdirectory?: string;
}

interface SelectedItem {
  path: string;
  files: File[];
  isDirectory: boolean;
}

const UploadFiles = () => {
  const [collectionName, setCollectionName] = useState('');
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [labels, setLabels] = useState<{ key: string; value: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirectorySupported, setIsDirectorySupported] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const directoryInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Check if the browser supports the `webkitdirectory` attribute.
    const testInput = document.createElement('input');
    testInput.type = 'file';
    if ('webkitdirectory' in testInput) {
      setIsDirectorySupported(true);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      filesArray.forEach((file) => {
        setSelectedItems((prev) => [
          ...prev,
          { path: file.name, files: [file], isDirectory: false },
        ]);
      });
    }
  };  

  const handleDirectoryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const directoriesMap: { [key: string]: File[] } = {};

      filesArray.forEach((file) => {
        const pathParts = file.webkitRelativePath.split('/');
        const isDirectory = pathParts.length > 1;
        const directoryPath = isDirectory ? pathParts.slice(0, -1).join('/') : '';

        if (directoryPath) {
          if (!directoriesMap[directoryPath]) {
            directoriesMap[directoryPath] = [];
          }
          directoriesMap[directoryPath].push(file);
        }
      });

      // Add directories to the selectedItems state
      Object.keys(directoriesMap).forEach((directoryPath) => {
        setSelectedItems((prev) => [
          ...prev,
          { path: directoryPath, files: directoriesMap[directoryPath], isDirectory: true },
        ]);
      });
    }
  };

  const handleRemoveItem = (index: number) => {
    setSelectedItems(selectedItems.filter((_, i) => i !== index));
  };

  const handleLabelChange = (index: number, key: string, value: string) => {
    const newLabels = [...labels];
    newLabels[index] = { key, value };
    setLabels(newLabels);
  };

  const addLabel = () => {
    setLabels([...labels, { key: '', value: '' }]);
  };

  const removeLabel = (index: number) => {
    setLabels(labels.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectionName) {
      alert('Please provide a collection name.');
      return;
    }
    if (selectedItems.length === 0) {
      alert('Please select at least one file or directory.');
      return;
    }
  
    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('collectionName', collectionName);
  
    selectedItems.forEach((item) => {
      item.files.forEach((file) => {
        // If the item is from a directory, use the relative path.
        // If it's an individual file, use just the file's name.
        const filePath = item.isDirectory ? `${item.path}/${file.name}` : file.name;
        formData.append('files', file, filePath);
      });
    });
  
    formData.append('labels', JSON.stringify(labels));
  
    try {
      const response = await fetch('/api/upload-files', {
        method: 'POST',
        body: formData,
      });
  
      const data = await response.json();
      if (data.success) {
        alert('Files uploaded successfully!');
        resetForm();
      } else {
        alert('Upload failed: ' + data.message);
      }
    } catch (error) {
      console.error('Error uploading files:', error);
      alert('An error occurred while uploading files.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const resetForm = () => {
    setCollectionName('');
    setSelectedItems([]);
    setLabels([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (directoryInputRef.current) {
      directoryInputRef.current.value = '';
    }
  };

  // Sort selected items so that directories appear first
  const sortedItems = [...selectedItems].sort((a, b) =>
    a.isDirectory === b.isDirectory ? 0 : a.isDirectory ? -1 : 1
  );

  return (
    <Paper elevation={3} sx={{ p: 4, maxWidth: 600, mx: 'auto', mt: 4 }}>
      <form onSubmit={handleSubmit}>
        <Typography variant="h6" gutterBottom>
          Upload Files or Directories
        </Typography>

        <TextField
          label="Collection Name"
          value={collectionName}
          onChange={(e) => setCollectionName(e.target.value)}
          required
          disabled={isSubmitting}
          fullWidth
          margin="normal"
        />

        <Box display="flex" gap={2} mb={2}>
          <Button
            variant="contained"
            component="label"
            disabled={isSubmitting}
            sx={{ flex: 1 }}
          >
            Add Files
            <input
              type="file"
              hidden
              multiple
              onChange={handleFileChange}
              ref={fileInputRef}
            />
          </Button>

          {isDirectorySupported && (
            <Button
              variant="contained"
              component="label"
              disabled={isSubmitting}
              sx={{ flex: 1 }}
            >
              Add Directory
              <input
                type="file"
                hidden
                multiple
                ref={directoryInputRef}
                // Apply `webkitdirectory` using a cast to `any` to avoid TypeScript errors.
                onChange={handleDirectoryChange}
                {...({ webkitdirectory: 'true' } as DirectoryInputProps)}
                />
            </Button>
          )}
        </Box>

        {sortedItems.length > 0 && (
          <List dense>
            {sortedItems.map((item, index) => (
              <ListItem key={index}>
                <Box display="flex" alignItems="center" gap={1} width="100%">
                  {item.isDirectory ? <Folder /> : <InsertDriveFile />}
                  <ListItemText
                    primary={item.path}
                    secondary={item.isDirectory ? `${item.files.length} file(s)` : undefined}
                    sx={{ flexGrow: 1 }}
                  />
                  <IconButton
                    edge="end"
                    aria-label="remove"
                    onClick={() => handleRemoveItem(index)}
                  >
                    <Delete />
                  </IconButton>
                </Box>
              </ListItem>
            ))}
          </List>
        )}

        <Typography variant="subtitle1" gutterBottom>
          Labels:
        </Typography>
        {labels.map((label, index) => (
          <Box key={index} display="flex" alignItems="center" gap={2} mb={1}>
            <IconButton
              onClick={() => removeLabel(index)}
              disabled={isSubmitting}
              aria-label="Remove Label"
            >
              <Remove />
            </IconButton>
            <TextField
              label="Label Name"
              value={label.key}
              onChange={(e) => handleLabelChange(index, e.target.value, label.value)}
              disabled={isSubmitting}
              fullWidth
            />
            <TextField
              label="Label Value"
              value={label.value}
              onChange={(e) => handleLabelChange(index, label.key, e.target.value)}
              disabled={isSubmitting}
              fullWidth
            />
          </Box>
        ))}

        <Button
          variant="outlined"
          onClick={addLabel}
          disabled={isSubmitting}
          startIcon={<Add />}
          sx={{ mb: 2 }}
        >
          Add Label
        </Button>

        <Button
          type="submit"
          variant="contained"
          color="primary"
          disabled={isSubmitting}
          fullWidth
        >
          {isSubmitting ? 'Uploading...' : 'Upload'}
        </Button>
      </form>
    </Paper>
  );
};

export default UploadFiles;
